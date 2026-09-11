import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution, sanitizePromptInput } from "@/lib/ai/guardrails";
import { generateSeasonIntelligence } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { buildSeasonCacheKey, getCachedIntelligence, setCachedIntelligence, withSingleFlight } from "@/lib/ai/cache";
import crypto from "crypto";
import type { AgentContext } from "@/lib/ai/types";
import type { SharedSeasonIntelligence } from "@/lib/ai/schemas/seasonIntelligence";
import { generateDeterministicSeasonFallback } from "@/lib/ai/fallback";

export const maxDuration = 60;
const SEASON_INTELLIGENCE_TTL_SECONDS = 60 * 60 * 12; // 12h - a season changes race-to-race, not minute-to-minute

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  // Parsed before the capacity guard (not after) and kept around for the catch block below too -
  // so EVERY fallback path here (capacity-denied, bad request, unhandled exception) can still
  // build a grounded fallback from real standings/battles instead of the bare `(0, 0)` a
  // pre-parse guard check used to force.
  let season = 0;
  let completedRounds = 0;
  let rawContextJson: string | undefined;

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { contextJson, season: bodySeason, completedRounds: bodyCompletedRounds, validIds, contextHash } = body as {
      contextJson?: string;
      season?: number;
      completedRounds?: number;
      validIds?: string[];
      contextHash?: string;
    };
    season = bodySeason ?? 0;
    completedRounds = bodyCompletedRounds ?? 0;
    rawContextJson = contextJson;

    if (!contextJson || !season || typeof completedRounds !== "number" || !validIds || !contextHash) {
      return NextResponse.json({ error: "MISSING_PARAMETERS" }, { status: 400 });
    }

    const guard = guardAIExecution(userId);
    if (!guard.allowed) {
      return NextResponse.json(generateDeterministicSeasonFallback(season, completedRounds, contextJson));
    }

    const sanitizedContext = sanitizePromptInput(contextJson, 10000);
    const cacheKey = buildSeasonCacheKey(season, "all", completedRounds, contextHash);

    const cached = await getCachedIntelligence<SharedSeasonIntelligence>(cacheKey, requestId);
    if (cached) return NextResponse.json(cached);

    const ctx: AgentContext = { userId, requestId, agentType: "season_intelligence", raceId: null, dataVersion: contextHash };

    const data = await withSingleFlight(cacheKey, async () => {
      const result = await generateSeasonIntelligence(sanitizedContext, season, completedRounds, validIds, ctx);
      if (result.generationMode === "ai" && result.data) {
        await setCachedIntelligence(cacheKey, result.data, contextHash, SEASON_INTELLIGENCE_TTL_SECONDS, { requestId });
      }
      return result.data;
    });

    return NextResponse.json(data);
  } catch (err) {
    logAIError(requestId, "season_intelligence_route_exception", String(err));
    return NextResponse.json(generateDeterministicSeasonFallback(season, completedRounds, rawContextJson));
  }
}

