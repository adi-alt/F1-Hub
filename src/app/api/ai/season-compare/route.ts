import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution, sanitizePromptInput } from "@/lib/ai/guardrails";
import { generateSeasonCompareInsight } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { buildSeasonCompareCacheKey, getCachedIntelligence, setCachedIntelligence, withSingleFlight } from "@/lib/ai/cache";
import crypto from "crypto";
import type { AgentContext } from "@/lib/ai/types";
import type { SeasonCompareInsight } from "@/lib/ai/schemas/seasonIntelligence";
import { generateDeterministicCompareFallback } from "@/lib/ai/fallback";

export const maxDuration = 60;
const SEASON_COMPARE_TTL_SECONDS = 60 * 60 * 24; // 24h - a compare pair's insight is stable between race weekends

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  let parsedBody: Record<string, unknown> = {};

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    parsedBody = body as Record<string, unknown>;

    const { contextJson, season, entityType, entityA, entityB, completedRounds, contextHash } = body as {
      contextJson?: string;
      season?: number;
      entityType?: "drivers" | "constructors";
      entityA?: string;
      entityB?: string;
      completedRounds?: number;
      contextHash?: string;
    };

    if (!contextJson || !season || !entityType || !entityA || !entityB || typeof completedRounds !== "number" || !contextHash) {
      return NextResponse.json({ error: "MISSING_PARAMETERS" }, { status: 400 });
    }

    if (entityA === entityB) {
      return NextResponse.json({ error: "SAME_ENTITY" }, { status: 400 });
    }

    const guard = guardAIExecution(userId);
    if (!guard.allowed) {
      return NextResponse.json(generateDeterministicCompareFallback(entityA, entityB));
    }

    const sanitizedContext = sanitizePromptInput(contextJson, 10000);
    const cacheKey = buildSeasonCompareCacheKey(season, entityType, entityA, entityB, completedRounds, contextHash);

    const cached = await getCachedIntelligence<SeasonCompareInsight>(cacheKey, requestId);
    if (cached) return NextResponse.json(cached);

    const ctx: AgentContext = { userId, requestId, agentType: "season_compare", raceId: null, dataVersion: contextHash };

    const data = await withSingleFlight(cacheKey, async () => {
      const result = await generateSeasonCompareInsight(sanitizedContext, entityA, entityB, ctx);
      if (result.generationMode === "ai" && result.data) {
        await setCachedIntelligence(cacheKey, result.data, contextHash, SEASON_COMPARE_TTL_SECONDS, { requestId });
      }
      return result.data;
    });

    return NextResponse.json(data);
  } catch (err) {
    logAIError(requestId, "season_compare_route_exception", String(err));
    const entityA = typeof parsedBody.entityA === "string" ? parsedBody.entityA : "A";
    const entityB = typeof parsedBody.entityB === "string" ? parsedBody.entityB : "B";
    return NextResponse.json(generateDeterministicCompareFallback(entityA, entityB));
  }
}
