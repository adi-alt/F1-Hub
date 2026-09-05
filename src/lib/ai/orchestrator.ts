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

/** Convert HomepageContextData into FallbackDataContext - both the fallback engine and the model
 * reason over the exact same underlying facts, just via different mechanisms (template strings
 * vs. an LLM), so a provider outage never means a less-personalized homepage, only less eloquent
 * prose. */
function toFallbackContext(data: HomepageContextData): FallbackDataContext {
  const totalPredictions = data.predictionFingerprint?.totalPredictions ?? 0;
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
    favoriteDriver: data.favoriteDriver
      ? {
          name: data.favoriteDriver.name,
          rank: data.favoriteDriver.rank,
          points: data.favoriteDriver.points,
          teamName: data.favoriteDriver.teamName,
          circuit: data.favoriteDriver.circuit,
        }
      : null,
    favoriteTeam: data.favoriteTeam ? { name: data.favoriteTeam.name, rank: data.favoriteTeam.rank, points: data.favoriteTeam.points } : null,
    model: data.model ? { topPredictedDriver: data.model.topPredictedDriver } : null,
    simulation: data.simulation ? { topSimulatedDriver: data.simulation.topSimulatedDriver, p1Probability: data.simulation.p1Probability } : null,
    userPrediction: data.userPrediction,
    predictionPerformance:
      totalPredictions > 0
        ? {
            winnerAccuracy: data.predictionFingerprint!.winnerAccuracy,
            totalPredictions,
            avgPositionError: data.predictionFingerprint!.avgPositionError ?? undefined,
          }
        : null,
    communitySummary: data.communityPosts && data.communityPosts.length > 0
      ? {
          recentPostCount: data.communityPosts.length,
          hotTopic: data.communityPosts[0]?.title?.slice(0, 40),
        }
      : null,
    sinceLastVisit: data.sinceLastVisit ?? null,
  };
}

/** Clean potential markdown code blocks from LLM output */
/** Extracts the actual JSON object from a raw model response. Handles two real, observed failure
 * modes, not just the markdown-fence case this originally covered: confirmed live in production
 * that Nemotron (despite the system prompt's explicit "output raw JSON only" instruction) can
 * preface its answer with plain prose narrating its own process ("Let me analyze the data and
 * construct...") before ever reaching the JSON object - `JSON.parse` on the raw string then fails
 * immediately on that leading text. Taking the substring between the first "{" and the last "}"
 * is robust to both leading prose and markdown fences without needing to enumerate every way a
 * model might wrap its answer. */
export function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    // There's real content before the object (prose, a fence remnant) - the object itself is
    // still well-formed JSON on its own, so slicing it out is enough; no need to touch anything
    // between the braces.
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

/**
 * Direct Mode: Bundled Homepage Intelligence Request.
 * Single call to the configured model, protected by 40 RPM provider capacity check and deterministic fallback.
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

  // 3. Invoke provider - single attempt, deliberately no retry. A retry made sense against a
  // transient failure; it doesn't against this task's real, measured cost - the full
  // HomepageIntelligence generation reliably takes ~58s (confirmed live via the diagnostic route's
  // own representative-context probe), so a retry would just double the worst-case wait for a call
  // that's slow, not flaky. providerConfig.timeoutMs already carries real margin above that.
  let rawContent: string | null = null;
  let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  const retryCount = 0;

  try {
    const response = await provider.chat(messages, null, providerConfig);
    rawContent = response.content;
    tokenUsage = response.usage;
  } catch (err) {
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
      logAIError(ctx.requestId, "validation_failure", "Failed to validate AI output schema", {
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
