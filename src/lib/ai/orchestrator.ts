// AI Orchestration Engine — Powers the F1 Hub Agentic Layer.
// Supports:
// 1. Direct Mode (Homepage): Single bundled invocation with pre-fetched context,
//    provider-capacity checking, and instant deterministic fallback on rate limits or errors.
// 2. Agent Mode: Bounded multi-step tool execution loop for future interactive agents.

import { getDefaultProvider } from "./provider";
import { acquireProviderCapacity } from "./providerRateLimiter";
import { formatHomepagePrompt, HOMEPAGE_PROMPT_VERSION } from "./prompts/homepagePrompt";
import { buildHomepageContext, type HomepageContextData } from "./context";
import { validateHomepageIntelligence, type HomepageIntelligence } from "./schemas/homepageIntelligence";
import { generateDeterministicFallback, type FallbackDataContext } from "./fallback";
import { logAIOperation, logDeterministicFallback, logAIError } from "./telemetry";
import {
  DEFAULT_ORCHESTRATOR_CONFIG,
  getDefaultAIModel,
  type AgentContext,
  type OrchestratorConfig,
  type StructuredOutput,
} from "./types";

/** Convert HomepageContextData into FallbackDataContext */
function toFallbackContext(data: HomepageContextData): FallbackDataContext {
  return {
    race: data.race
      ? {
          name: data.race.name,
          round: data.race.round,
          season: data.race.season,
          circuitName: data.race.circuitName,
          city: data.race.city,
        }
      : null,
    standings: data.standings
      ? {
          driverLeader: data.standings.driverLeader
            ? { name: data.standings.driverLeader.name, points: data.standings.driverLeader.points }
            : undefined,
          driverSecond: data.standings.driverSecond
            ? { name: data.standings.driverSecond.name, points: data.standings.driverSecond.points }
            : undefined,
          constructorLeader: data.standings.constructorLeader
            ? { name: data.standings.constructorLeader.name, points: data.standings.constructorLeader.points }
            : undefined,
        }
      : null,
    trackHistory: data.trackHistory
      ? {
          defendingWinner: data.trackHistory.defendingWinner,
          topPerformer: data.trackHistory.topPerformer,
          totalRaces: data.trackHistory.totalRaces,
        }
      : null,
    favoriteDriver: data.favoriteDriver,
    favoriteTeam: data.favoriteTeam,
    model: data.model,
    userPrediction: data.userPrediction,
    predictionPerformance: data.predictionPerformance,
    communitySummary: data.communityPosts && data.communityPosts.length > 0
      ? {
          recentPostCount: data.communityPosts.length,
          hotTopic: data.communityPosts[0]?.title?.slice(0, 40),
        }
      : null,
  };
}

/** Clean potential markdown code blocks from LLM output */
function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Direct Mode: Bundled Homepage Intelligence Request.
 * Single call to Kimi K3, protected by 40 RPM provider capacity check and deterministic fallback.
 */
export async function generateHomepageIntelligence(
  contextData: HomepageContextData,
  ctx: AgentContext,
  dataVersion: string,
  config: Partial<OrchestratorConfig> = {},
): Promise<StructuredOutput<HomepageIntelligence>> {
  const startTime = Date.now();
  const provider = getDefaultProvider();
  const model = config.provider?.model || getDefaultAIModel();
  const fallbackContext = toFallbackContext(contextData);

  // 1. Check & acquire provider capacity (40 RPM ceiling)
  const capacity = acquireProviderCapacity("nvidia");
  if (!capacity.allowed) {
    logDeterministicFallback(ctx.requestId, "PROVIDER_RATE_LIMITED", {
      currentRPM: capacity.currentRPM,
      limit: capacity.limit,
      retryAfterSeconds: capacity.retryAfterSeconds,
    });

    const fallback = generateDeterministicFallback(fallbackContext, "PROVIDER_RATE_LIMITED");
    logAIOperation({
      requestId: ctx.requestId,
      agentType: "homepage_intelligence",
      userId: ctx.userId,
      provider: provider.name,
      model,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      toolCalls: [],
      totalDurationMs: Date.now() - startTime,
      cacheHit: false,
      validationSuccess: true,
      providerRPMCurrent: capacity.currentRPM,
      providerRPMLimit: capacity.limit,
      capacityExhausted: true,
      fallbackUsed: true,
      fallbackReason: "PROVIDER_RATE_LIMITED",
    });

    return {
      data: fallback.data,
      generatedAt: new Date().toISOString(),
      dataVersion,
      agentType: "homepage_intelligence",
      modelIdentifier: model,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      isFallback: true,
      fallbackReason: "PROVIDER_RATE_LIMITED",
    };
  }

  // 2. Format compact prompt
  const contextString = buildHomepageContext(contextData);
  const messages = formatHomepagePrompt(contextString);

  const providerConfig = {
    ...DEFAULT_ORCHESTRATOR_CONFIG.provider,
    ...config.provider,
    model,
  };

  // 3. Invoke provider with retry on transient failure
  let rawContent: string | null = null;
  let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  let retryCount = 0;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const response = await provider.chat(messages, null, providerConfig);
      rawContent = response.content;
      tokenUsage = response.usage;
      break;
    } catch (err) {
      retryCount++;
      if (attempt === 1) {
        logAIError(ctx.requestId, "provider_failure_final", String(err));
        const fallback = generateDeterministicFallback(fallbackContext, "PROVIDER_ERROR");
        return {
          data: fallback.data,
          generatedAt: new Date().toISOString(),
          dataVersion,
          agentType: "homepage_intelligence",
          modelIdentifier: model,
          promptVersion: HOMEPAGE_PROMPT_VERSION,
          isFallback: true,
          fallbackReason: "PROVIDER_ERROR",
        };
      }
    }
  }

  // 4. Validate output schema
  if (!rawContent) {
    const fallback = generateDeterministicFallback(fallbackContext, "EMPTY_RESPONSE");
    return {
      data: fallback.data,
      generatedAt: new Date().toISOString(),
      dataVersion,
      agentType: "homepage_intelligence",
      modelIdentifier: model,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      isFallback: true,
      fallbackReason: "EMPTY_RESPONSE",
    };
  }

  try {
    const parsed = JSON.parse(cleanJsonOutput(rawContent));
    const validation = validateHomepageIntelligence(parsed);

    if (!validation.valid || !validation.data) {
      logAIError(ctx.requestId, "validation_failure", "Failed to validate Kimi output schema", {
        errors: validation.errors,
      });
      const fallback = generateDeterministicFallback(fallbackContext, "SCHEMA_VALIDATION_FAILED");
      return {
        data: fallback.data,
        generatedAt: new Date().toISOString(),
        dataVersion,
        agentType: "homepage_intelligence",
        modelIdentifier: model,
        promptVersion: HOMEPAGE_PROMPT_VERSION,
        isFallback: true,
        fallbackReason: "SCHEMA_VALIDATION_FAILED",
      };
    }

    logAIOperation({
      requestId: ctx.requestId,
      agentType: "homepage_intelligence",
      userId: ctx.userId,
      provider: provider.name,
      model,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      toolCalls: [],
      totalDurationMs: Date.now() - startTime,
      tokenUsage,
      cacheHit: false,
      validationSuccess: true,
      providerRPMCurrent: capacity.currentRPM,
      providerRPMLimit: capacity.limit,
      retryCount,
    });

    return {
      data: validation.data,
      generatedAt: new Date().toISOString(),
      dataVersion,
      agentType: "homepage_intelligence",
      modelIdentifier: model,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      isFallback: false,
    };
  } catch (parseErr) {
    logAIError(ctx.requestId, "json_parse_error", String(parseErr));
    const fallback = generateDeterministicFallback(fallbackContext, "JSON_PARSE_ERROR");
    return {
      data: fallback.data,
      generatedAt: new Date().toISOString(),
      dataVersion,
      agentType: "homepage_intelligence",
      modelIdentifier: model,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      isFallback: true,
      fallbackReason: "JSON_PARSE_ERROR",
    };
  }
}
