// POST /api/ai/race-event-take
//
// The compact Apex take inside the season page's race window. Same architecture as the other two
// season routes: the client sends a season and a round, every fact is fetched server-side from
// authoritative data, and the response carries its own `source`.
//
// Deliberately separate from /api/ai/race-intelligence, which powers the full race page with a
// far larger five-section schema. This one produces a headline and a short paragraph, and is
// shared across every user looking at the same round.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution } from "@/lib/ai/guardrails";
import { generateRaceEventTake } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { buildRaceEventCacheKey, computeDataVersion, getCachedIntelligence, setCachedIntelligence, withSingleFlight } from "@/lib/ai/cache";
import { SEASON_CONTEXT_VERSION, formatRaceEventContext, type RaceEventContext } from "@/lib/ai/context/seasonContext";
import { RACE_EVENT_PROMPT_VERSION } from "@/lib/ai/prompts/raceEventPrompt";
import { generateRaceEventFallback } from "@/lib/ai/fallback";
import { getSeasonDetailData } from "@/app/season/_service/season.service";
import { completedRaces } from "@/app/season/_service/season.pure";
import type { AgentContext } from "@/lib/ai/types";
import type { RaceEventTake, IntelligenceSource } from "@/lib/ai/schemas/seasonIntelligence";

export const maxDuration = 45;
// A completed round's facts never change again, so its take is cached long. An upcoming or live
// round genuinely does change (sessions run, forecasts update), so it gets a short TTL.
const COMPLETED_TTL_SECONDS = 60 * 60 * 24 * 14;
const ACTIVE_TTL_SECONDS = 60 * 30;
const CACHE_VERSION = `${SEASON_CONTEXT_VERSION}+${RACE_EVENT_PROMPT_VERSION}`;

type Envelope = { content: RaceEventTake; source: IntelligenceSource; generatedAt: string; round: number };

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { season, round } = body as { season?: unknown; round?: unknown };
    if (typeof season !== "number" || !Number.isInteger(season)) return NextResponse.json({ error: "INVALID_SEASON" }, { status: 400 });
    if (typeof round !== "number" || !Number.isInteger(round) || round < 1) return NextResponse.json({ error: "INVALID_ROUND" }, { status: 400 });

    const data = await getSeasonDetailData(season, userId);
    const race = data.raceSummaries.find((r) => r.round === round);
    if (!race) return NextResponse.json({ error: "UNKNOWN_ROUND" }, { status: 404 });

    const leader = data.drivers[0];
    const second = data.drivers[1];
    if (!leader) return NextResponse.json({ error: "NO_CHAMPIONSHIP_DATA" }, { status: 404 });

    // Circuit/form notes from this season's own completed rounds only - never invented history.
    const priorFormLines: string[] = [];
    const sameCircuit = completedRaces(data.raceSummaries).filter((r) => r.round !== round && r.circuit && r.circuit === race.circuit);
    for (const prior of sameCircuit.slice(-2)) {
      if (prior.winnerName) priorFormLines.push(`Round ${prior.round} at the same circuit was won by ${prior.winnerName}.`);
    }
    const lastCompleted = completedRaces(data.raceSummaries).at(-1);
    if (lastCompleted && lastCompleted.round !== round && lastCompleted.winnerName) {
      priorFormLines.push(`The most recent completed round (${lastCompleted.name}) was won by ${lastCompleted.winnerName}.`);
    }

    const context: RaceEventContext = {
      season,
      race,
      championship: {
        leader: leader.driverName,
        leaderPoints: leader.points,
        second: second?.driverName ?? null,
        secondPoints: second?.points ?? null,
        gap: second ? leader.points - second.points : null,
      },
      priorFormLines,
    };

    const contextHash = computeDataVersion([formatRaceEventContext(context)]);
    const cacheKey = buildRaceEventCacheKey(season, round, contextHash, CACHE_VERSION);

    const cached = await getCachedIntelligence<Envelope>(cacheKey, requestId);
    if (cached) return NextResponse.json(cached);

    const guard = guardAIExecution(userId);
    if (!guard.allowed) {
      return NextResponse.json({ content: generateRaceEventFallback(race), source: "fallback", generatedAt: new Date().toISOString(), round } satisfies Envelope);
    }

    const ctx: AgentContext = { userId, requestId, agentType: "season_race_take", raceId: `${season}-r${round}`, dataVersion: contextHash };

    const envelope = await withSingleFlight(cacheKey, async () => {
      const result = await generateRaceEventTake(context, ctx);
      const out: Envelope = { content: result.data, source: result.source, generatedAt: new Date().toISOString(), round };
      if (result.source === "llm") {
        await setCachedIntelligence(cacheKey, out, contextHash, race.weekendStatus === "completed" ? COMPLETED_TTL_SECONDS : ACTIVE_TTL_SECONDS, {
          requestId,
          promptVersion: RACE_EVENT_PROMPT_VERSION,
        });
      }
      return out;
    });

    return NextResponse.json(envelope);
  } catch (err) {
    logAIError(requestId, "race_event_take_route_exception", String(err));
    return NextResponse.json({ error: "RACE_TAKE_UNAVAILABLE" }, { status: 503 });
  }
}
