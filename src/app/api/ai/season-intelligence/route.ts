import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution, sanitizePromptInput } from "@/lib/ai/guardrails";
import { generateSeasonIntelligence } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { buildSeasonCacheKey } from "@/lib/ai/cache";
import { kv } from "@vercel/kv";
import crypto from "crypto";
import type { AgentContext } from "@/lib/ai/types";
import { generateDeterministicSeasonFallback } from "@/lib/ai/fallback";

export const maxDuration = 60;

const inFlightGenerations = new Map<string, Promise<any>>();

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const guard = guardAIExecution(userId);
    if (!guard.allowed) {
      return NextResponse.json(generateDeterministicSeasonFallback(0, 0));
    }

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { contextJson, season, completedRounds, validIds, contextHash } = body as any;

    if (!contextJson || !season || typeof completedRounds !== "number" || !validIds || !contextHash) {
      return NextResponse.json({ error: "MISSING_PARAMETERS" }, { status: 400 });
    }

    const sanitizedContext = sanitizePromptInput(contextJson, 10000);
    const cacheKey = buildSeasonCacheKey(season, "all", completedRounds, contextHash);

    // Cache lookup
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    } catch (e) {
      logAIError(requestId, "kv_cache_read_error", String(e));
    }

    // Single-flight deduplication
    if (inFlightGenerations.has(cacheKey)) {
      const result = await inFlightGenerations.get(cacheKey);
      return NextResponse.json(result);
    }

    const ctx: AgentContext = { userId, requestId, agentType: "season_intelligence", raceId: null, dataVersion: contextHash };

    const generationPromise = generateSeasonIntelligence(sanitizedContext, season, completedRounds, validIds, ctx)
      .then(async (result) => {
        if (result.generationMode === "ai" && result.data) {
          try {
            await kv.set(cacheKey, result.data, { ex: 60 * 60 * 24 }); // Cache for 24h
          } catch (e) {
            logAIError(requestId, "kv_cache_write_error", String(e));
          }
        }
        return result.data;
      })
      .finally(() => {
        inFlightGenerations.delete(cacheKey);
      });

    inFlightGenerations.set(cacheKey, generationPromise);

    const data = await generationPromise;
    return NextResponse.json(data);

  } catch (err) {
    logAIError(requestId, "season_intelligence_route_exception", String(err));
    return NextResponse.json(generateDeterministicSeasonFallback(0, 0));
  }
}
