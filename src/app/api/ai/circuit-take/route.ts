// POST /api/ai/circuit-take
//
// The Apex Circuit Take. Same architecture as /api/ai/race-event-take and /api/ai/season-compare:
// the client sends only a location and a year, every fact is fetched and computed server-side from
// authoritative data (getCircuitDetailData), and the response carries its own `source`. Shared
// across every visitor to the same circuit page in the same state - a favorite team doesn't
// trigger a second generation, per the same shared-vs-personal split every other Apex surface uses.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution } from "@/lib/ai/guardrails";
import { generateCircuitTake } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { buildCircuitTakeCacheKey, computeDataVersion, getCachedIntelligence, setCachedIntelligence, withSingleFlight } from "@/lib/ai/cache";
import { buildCircuitContext, formatCircuitContext } from "@/lib/ai/context/circuitContext";
import { CIRCUIT_TAKE_PROMPT_VERSION } from "@/lib/ai/prompts/circuitTakePrompt";
import { generateCircuitTakeFallback } from "@/lib/ai/fallback";
import { getCircuitDetailData } from "@/app/circuits/services/circuits.service";
import { raceTitle } from "@/lib/format";
import type { AgentContext } from "@/lib/ai/types";
import type { RaceEventTake, IntelligenceSource } from "@/lib/ai/schemas/seasonIntelligence";

export const maxDuration = 45;
const COMPLETED_TTL_SECONDS = 60 * 60 * 24 * 14; // this season's own result here never changes once it's run
const ACTIVE_TTL_SECONDS = 60 * 30; // upcoming/next - forecast and form both still move
const CACHE_VERSION = `circuit-ctx-v1+${CIRCUIT_TAKE_PROMPT_VERSION}`;

type Envelope = { content: RaceEventTake; source: IntelligenceSource; generatedAt: string; location: string };

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { location, year } = body as { location?: unknown; year?: unknown };
    if (typeof location !== "string" || !location.trim()) return NextResponse.json({ error: "MISSING_LOCATION" }, { status: 400 });
    if (typeof year !== "number" || !Number.isInteger(year)) return NextResponse.json({ error: "INVALID_YEAR" }, { status: 400 });

    const data = await getCircuitDetailData(location, year, userId);
    if (!data) return NextResponse.json({ error: "UNKNOWN_CIRCUIT" }, { status: 404 });

    const grandPrixName =
      data.currentSeasonRace?.name ??
      data.liveRaces.find((r) => r.year === data.timeline[0]?.year)?.name ??
      data.archiveRaces.find((r) => r.year === data.timeline[0]?.year)?.raceName ??
      null;
    const country = data.currentSeasonRace?.country ?? data.archiveRaces[0]?.country ?? null;
    const displayName = data.facts?.venueName ?? raceTitle(location);

    const context = buildCircuitContext(location, displayName, grandPrixName, country, year, data.facts, data.currentSeasonRace, data.timeline);
    const contextHash = computeDataVersion([formatCircuitContext(context)]);
    const cacheKey = buildCircuitTakeCacheKey(location, year, context.state, contextHash, CACHE_VERSION);

    const cached = await getCachedIntelligence<Envelope>(cacheKey, requestId);
    if (cached) return NextResponse.json(cached);

    const guard = guardAIExecution(userId);
    if (!guard.allowed) {
      return NextResponse.json({ content: generateCircuitTakeFallback(context), source: "fallback", generatedAt: new Date().toISOString(), location } satisfies Envelope);
    }

    const ctx: AgentContext = { userId, requestId, agentType: "circuit_take", raceId: null, dataVersion: contextHash };

    const envelope = await withSingleFlight(cacheKey, async () => {
      const result = await generateCircuitTake(context, ctx);
      const out: Envelope = { content: result.data, source: result.source, generatedAt: new Date().toISOString(), location };
      if (result.source === "llm") {
        await setCachedIntelligence(cacheKey, out, contextHash, context.state === "completed" ? COMPLETED_TTL_SECONDS : ACTIVE_TTL_SECONDS, {
          requestId,
          promptVersion: CIRCUIT_TAKE_PROMPT_VERSION,
        });
      }
      return out;
    });

    return NextResponse.json(envelope);
  } catch (err) {
    logAIError(requestId, "circuit_take_route_exception", String(err));
    return NextResponse.json({ error: "CIRCUIT_TAKE_UNAVAILABLE" }, { status: 503 });
  }
}
