import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution, sanitizePromptInput } from "@/lib/ai/guardrails";
import { generateSeasonCompareInsight } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { buildSeasonCompareCacheKey } from "@/lib/ai/cache";
import { kv } from "@vercel/kv";
import crypto from "crypto";
import type { AgentContext } from "@/lib/ai/types";
import { generateDeterministicCompareFallback } from "@/lib/ai/fallback";

export const maxDuration = 60;

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { contextJson, season, entityType, entityA, entityB, completedRounds, contextHash } = body as any;

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

    // Cache lookup
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    } catch (e) {
      logAIError(requestId, "kv_cache_read_error", String(e));
    }

    const ctx: AgentContext = { userId, requestId, agentType: "season_compare", raceId: null, dataVersion: contextHash };

    // Request may be cancelled client-side; Next.js handles aborts gracefully
    const result = await generateSeasonCompareInsight(sanitizedContext, entityA, entityB, ctx);

    if (result.generationMode === "ai" && result.data) {
      try {
        await kv.set(cacheKey, result.data, { ex: 60 * 60 * 24 }); // Cache for 24h
      } catch (e) {
        logAIError(requestId, "kv_cache_write_error", String(e));
      }
    }

    return NextResponse.json(result.data);

  } catch (err) {
    logAIError(requestId, "season_compare_route_exception", String(err));
    // Provide a deterministic fallback on failure
    const body: any = await req.json().catch(() => ({}));
    return NextResponse.json(generateDeterministicCompareFallback(body.entityA || "A", body.entityB || "B"));
  }
}
