// POST /api/ai/season-intelligence
//
// Server-authoritative by construction. The client sends a season year and nothing else: every
// fact the model sees is fetched here, from the exact same getSeasonDetailData the page itself
// renders from. The route previously accepted a `contextJson` blob built in the browser, which
// meant (a) the page and the prompt could drift apart, and (b) client-supplied statistics reached
// a prompt - both of which the architecture explicitly forbids.
//
// The response is an envelope, not bare content: `source` records whether a model actually wrote
// this or whether it was assembled deterministically. The UI renders both identically; the
// application must never confuse them.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution } from "@/lib/ai/guardrails";
import { generateSeasonIntelligence } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { buildSeasonCacheKey, computeDataVersion, getCachedIntelligence, setCachedIntelligence, withSingleFlight } from "@/lib/ai/cache";
import { SEASON_CONTEXT_VERSION, formatSeasonNarrativeContext, type SeasonNarrativeContext } from "@/lib/ai/context/seasonContext";
import { SEASON_PROMPT_VERSION } from "@/lib/ai/prompts/seasonPrompt";
import { generateSeasonFallbackFromContext } from "@/lib/ai/fallback";
import { getSeasonDetailData } from "@/app/season/_service/season.service";
import { RECENT_FORM_WINDOW, completedRaces, computePositionChanges, entityResults, recentResults } from "@/app/season/_service/season.pure";
import type { AgentContext } from "@/lib/ai/types";
import type { SharedSeasonIntelligence, IntelligenceSource } from "@/lib/ai/schemas/seasonIntelligence";

export const maxDuration = 60;
// A season changes race-to-race, not minute-to-minute. Only real model output is stored at this
// TTL - a deterministic result is never cached, so the request right after the provider recovers
// gets a fresh attempt instead of being pinned behind a 12h entry.
const SEASON_TTL_SECONDS = 60 * 60 * 12;
const CACHE_VERSION = `${SEASON_CONTEXT_VERSION}+${SEASON_PROMPT_VERSION}`;

type Envelope = { content: SharedSeasonIntelligence; source: IntelligenceSource; generatedAt: string };

/** Assembles the deterministic narrative context from authoritative season data. This is the ONLY
 * thing the model is ever given for this feature. */
export function buildNarrativeContext(data: Awaited<ReturnType<typeof getSeasonDetailData>>): SeasonNarrativeContext {
  const nextRace = data.raceSummaries.find((r) => r.state === "next") ?? null;
  const changes = computePositionChanges(data.drivers, data.constructors, data.progression);
  const formWindow = Math.min(RECENT_FORM_WINDOW, completedRaces(data.raceSummaries).length);

  const movers = changes.drivers
    .map((c) => ({
      name: data.drivers.find((d) => d.driver === c.entityId)?.driverName ?? c.entityId,
      positionDelta: c.positionDelta,
      pointsDelta: c.pointsDelta,
    }))
    .filter((m) => (m.positionDelta ?? 0) !== 0 || (m.pointsDelta ?? 0) !== 0)
    .sort((a, b) => Math.abs(b.positionDelta ?? 0) - Math.abs(a.positionDelta ?? 0) || (b.pointsDelta ?? 0) - (a.pointsDelta ?? 0));

  const recentForm = data.drivers
    .map((d) => ({ name: d.driverName, points: recentResults(entityResults(data.raceSummaries, d.driver, false)).reduce((sum, r) => sum + r.points, 0) }))
    .sort((a, b) => b.points - a.points);

  return {
    season: data.year,
    status: data.status,
    completedRounds: data.racesCompleted,
    remainingRounds: data.racesRemaining,
    nextRace: nextRace ? { round: nextRace.round, name: nextRace.name } : null,
    drivers: data.drivers,
    constructors: data.constructors,
    battles: data.battles,
    records: data.records,
    raceSummaries: data.raceSummaries,
    movers,
    recentForm,
    formWindow,
  };
}

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const season = body && typeof body === "object" ? (body as { season?: unknown }).season : undefined;
    if (typeof season !== "number" || !Number.isInteger(season) || season < 1950 || season > 2100) {
      return NextResponse.json({ error: "INVALID_SEASON" }, { status: 400 });
    }

    const data = await getSeasonDetailData(season, userId);
    const context = buildNarrativeContext(data);

    // The cache key hashes the model's ACTUAL input. Any change to the facts the model would see
    // produces a different key, so a stale entry can never outlive the data it describes - and no
    // client-supplied hash is trusted for this.
    const contextHash = computeDataVersion([formatSeasonNarrativeContext(context)]);
    const cacheKey = buildSeasonCacheKey(season, "all", data.racesCompleted, contextHash, CACHE_VERSION);

    const cached = await getCachedIntelligence<Envelope>(cacheKey, requestId);
    if (cached) return NextResponse.json(cached);

    // The capacity guard runs AFTER the context is built, so a rate-limited request still returns
    // a fully grounded deterministic result rather than a generic one.
    const guard = guardAIExecution(userId);
    if (!guard.allowed) {
      return NextResponse.json({ content: generateSeasonFallbackFromContext(context), source: "fallback", generatedAt: new Date().toISOString() } satisfies Envelope);
    }

    const ctx: AgentContext = { userId, requestId, agentType: "season_intelligence", raceId: null, dataVersion: contextHash };

    const envelope = await withSingleFlight(cacheKey, async () => {
      const result = await generateSeasonIntelligence(context, ctx);
      const out: Envelope = { content: result.data, source: result.source, generatedAt: new Date().toISOString() };
      // Only a real generation is cached. Caching a fallback at this TTL would keep serving it
      // long after the provider recovered, and would make `source` a lie on every later hit.
      if (result.source === "llm") await setCachedIntelligence(cacheKey, out, contextHash, SEASON_TTL_SECONDS, { requestId, promptVersion: SEASON_PROMPT_VERSION });
      return out;
    });

    return NextResponse.json(envelope);
  } catch (err) {
    logAIError(requestId, "season_intelligence_route_exception", String(err));
    return NextResponse.json({ error: "SEASON_INTELLIGENCE_UNAVAILABLE" }, { status: 503 });
  }
}
