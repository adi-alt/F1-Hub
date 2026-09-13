// POST /api/ai/season-compare
//
// THE fix for the wrong-pair bug, which was a server bug, not a client race condition.
//
// Previously this route forwarded the entire client-built season blob to the model and never told
// it which two entities were selected. Reproduced live against the real provider: with Hamilton
// and Antonelli selected, the model returned "Hulkenberg and Sainz locked on equal points" -
// because the battles array was the most comparison-shaped thing in the payload and nothing in
// the prompt said otherwise.
//
// Now: the client sends two IDs. The server resolves them against authoritative season data,
// builds a pair-ONLY deterministic context, and the model never sees a third competitor. The
// response echoes the exact identity it was generated for, so the client can refuse to render a
// reply that no longer matches the current selection.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution } from "@/lib/ai/guardrails";
import { generateSeasonCompareInsight } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { buildSeasonCompareCacheKey, canonicalizePair, computeDataVersion, getCachedIntelligence, mirrorCompareInsight, setCachedIntelligence, withSingleFlight } from "@/lib/ai/cache";
import { SEASON_CONTEXT_VERSION, formatComparePairContext } from "@/lib/ai/context/seasonContext";
import { SEASON_COMPARE_PROMPT_VERSION } from "@/lib/ai/prompts/seasonComparePrompt";
import { generateCompareFallbackFromPair } from "@/lib/ai/fallback";
import { getSeasonDetailData } from "@/app/season/_service/season.service";
import { buildComparePair } from "@/app/season/_service/season.pure";
import type { AgentContext } from "@/lib/ai/types";
import type { SeasonCompareInsight, IntelligenceSource, CompareIdentity } from "@/lib/ai/schemas/seasonIntelligence";

export const maxDuration = 60;
const COMPARE_TTL_SECONDS = 60 * 60 * 24;
const CACHE_VERSION = `${SEASON_CONTEXT_VERSION}+${SEASON_COMPARE_PROMPT_VERSION}`;

type Envelope = { content: SeasonCompareInsight; source: IntelligenceSource; generatedAt: string; identity: CompareIdentity };
type CachedCompare = { content: SeasonCompareInsight; source: IntelligenceSource; generatedAt: string };

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { season, entityType, entityA, entityB } = body as { season?: unknown; entityType?: unknown; entityA?: unknown; entityB?: unknown };

    if (typeof season !== "number" || !Number.isInteger(season)) return NextResponse.json({ error: "INVALID_SEASON" }, { status: 400 });
    if (entityType !== "drivers" && entityType !== "constructors") return NextResponse.json({ error: "INVALID_ENTITY_TYPE" }, { status: 400 });
    if (typeof entityA !== "string" || typeof entityB !== "string" || !entityA || !entityB) return NextResponse.json({ error: "MISSING_ENTITIES" }, { status: 400 });
    if (entityA === entityB) return NextResponse.json({ error: "SAME_ENTITY" }, { status: 400 });

    const data = await getSeasonDetailData(season, userId);

    // Canonical ordering keeps a reversed selection from paying for a second generation. The
    // stored value is directional, so the response is mirrored back into the caller's own display
    // order below - sorting the key WITHOUT mirroring is what previously served a cached answer
    // with both sides silently swapped.
    const ordering = canonicalizePair(entityA, entityB);
    const { canonicalA, canonicalB, canonicalOrderMatches } = ordering;

    const canonicalPair = buildComparePair(season, entityType, canonicalA, canonicalB, data.drivers, data.constructors, data.raceSummaries);
    if (!canonicalPair) return NextResponse.json({ error: "UNKNOWN_ENTITY" }, { status: 404 });

    const identity: CompareIdentity = { season, entityType, entityA, entityB, completedRounds: data.racesCompleted };

    // Hash the model's real input, so any change in the underlying facts busts the entry.
    const contextHash = computeDataVersion([formatComparePairContext(canonicalPair)]);
    const key = buildSeasonCompareCacheKey(season, entityType, ordering, data.racesCompleted, contextHash, CACHE_VERSION);

    const present = (cached: CachedCompare): Envelope => ({
      content: canonicalOrderMatches ? cached.content : mirrorCompareInsight(cached.content),
      source: cached.source,
      generatedAt: cached.generatedAt,
      identity,
    });

    const cached = await getCachedIntelligence<CachedCompare>(key, requestId);
    if (cached) return NextResponse.json(present(cached));

    const guard = guardAIExecution(userId);
    if (!guard.allowed) {
      // Built from the canonical pair then mirrored, exactly like a cached value - so the
      // rate-limited path can't become a second place where direction is handled differently.
      return NextResponse.json(present({ content: generateCompareFallbackFromPair(canonicalPair), source: "fallback", generatedAt: new Date().toISOString() }));
    }

    // Every OTHER competitor's display name, so validation can reject a response that drifted.
    // Structurally the model can't see them at all; this is the second line of defence.
    const forbiddenNames =
      entityType === "drivers"
        ? data.drivers.filter((d) => d.driver !== canonicalA && d.driver !== canonicalB).map((d) => d.driverName)
        : data.constructors.filter((c) => c.team !== canonicalA && c.team !== canonicalB).map((c) => c.team);

    const ctx: AgentContext = { userId, requestId, agentType: "season_compare", raceId: null, dataVersion: contextHash };

    const stored = await withSingleFlight(key, async () => {
      const result = await generateSeasonCompareInsight(canonicalPair, forbiddenNames, ctx);
      const out: CachedCompare = { content: result.data, source: result.source, generatedAt: new Date().toISOString() };
      if (result.source === "llm") await setCachedIntelligence(key, out, contextHash, COMPARE_TTL_SECONDS, { requestId, promptVersion: SEASON_COMPARE_PROMPT_VERSION });
      return out;
    });

    return NextResponse.json(present(stored));
  } catch (err) {
    logAIError(requestId, "season_compare_route_exception", String(err));
    return NextResponse.json({ error: "COMPARE_INTELLIGENCE_UNAVAILABLE" }, { status: 503 });
  }
}
