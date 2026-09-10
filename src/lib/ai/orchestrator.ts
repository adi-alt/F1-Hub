// AI Orchestration Engine — Powers the F1 Hub Agentic Layer.
// Supports:
// 1. Direct Mode (Homepage): Single bundled invocation with pre-fetched context,
//    provider-capacity checking, and instant deterministic fallback on rate limits or errors.
// 2. Agent Mode: Bounded multi-step tool execution loop for future interactive agents.

import { chatWithProviderFallback } from "./providerFallback";
import { acquireProviderCapacity } from "./providerRateLimiter";
import { formatHomepagePrompt, HOMEPAGE_PROMPT_VERSION } from "./prompts/homepagePrompt";
import { formatPersonalOnlyPrompt, formatRaceIntelligencePrompt, RACE_INTELLIGENCE_PROMPT_VERSION } from "./prompts/raceIntelligencePrompt";
import { buildHomepageContext, type HomepageContextData } from "./context";
import { formatRaceIntelligenceContext, hasPersonalContext, type RaceIntelligenceContext } from "./context/raceContext";
import { validateHomepageIntelligence, type HomepageIntelligence } from "./schemas/homepageIntelligence";
import { validatePersonalOnlyResult, validateRaceIntelligenceResult, type PersonalRaceInsight, type SharedRaceIntelligence } from "./schemas/raceIntelligence";
import { generateDeterministicFallback, generateDeterministicRaceFallback, type FallbackDataContext } from "./fallback";
import { logAIOperation, logDeterministicFallback, logAIError } from "./telemetry";
import { categorizeProviderError, categorizeFallbackReason } from "./errorCategory";
import type { AgentContext, OrchestratorConfig, StructuredOutput } from "./types";

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

// Feature-specific maxTokens, replacing the shared DEFAULT_ORCHESTRATOR_CONFIG.provider.maxTokens
// (8192) both features used previously - that value came from a pre-Groq-migration Muse Glimmer
// benchmark unrelated to either of these schemas. Real measurement (2026-09-10): a local script
// called the actual chatWithProviderFallback against each feature's real prompt/schema with a
// realistic, fully-populated fixture (rich favorites/prediction/since-last-visit for homepage; full
// evidenceFacts/tireStrategy/keyMoments for race intelligence) - not live-sampled production
// traffic, but a real Groq/OpenRouter call each time, 3 runs per feature:
//   HOMEPAGE:          completionTokens 3114, 3319 (Groq), 1888 (OpenRouter, real 429 fallback
//                       triggered mid-run by this account's own 8000 TPM budget) - max observed 3319.
//   RACE_INTELLIGENCE: completionTokens 1719, 1721, 1576 (Groq) - max observed 1721.
// Neither feature came remotely close to truncating at 8192. These caps keep meaningful headroom
// (~1.5x-1.9x the observed max) rather than shaving it to the exact sample - 3 runs each is not
// enough to treat the observed max as a hard ceiling, only as a real, evidence-based order of
// magnitude. The benefit isn't day-to-day savings (a normal completion stops at its own natural end
// regardless of the cap) - it's bounding the worst case if a run ever loops/repeats instead of
// stopping, which previously could burn up to 8192 tokens before the cap kicked in.
const HOMEPAGE_MAX_TOKENS = 5000;
const RACE_INTELLIGENCE_MAX_TOKENS = 3000;

/**
 * Direct Mode: Bundled Homepage Intelligence Request.
 * Groq primary / OpenRouter fallback (see providerFallback.ts), protected by an RPM capacity
 * check and deterministic fallback if both providers fail.
 */
export async function generateHomepageIntelligence(
  contextData: HomepageContextData,
  ctx: AgentContext,
  dataVersion: string,
  config: Partial<OrchestratorConfig> = {},
): Promise<StructuredOutput<HomepageIntelligence>> {
  const startTime = Date.now();
  // Not yet known which provider will actually serve this - chatWithProviderFallback below
  // resolves that; this is only the label for the early rate-limited-return path, which never
  // gets far enough to attempt either one.
  const plannedModel = "groq/openai/gpt-oss-120b";
  const fallbackContext = toFallbackContext(contextData);

  // 1. Check & acquire provider capacity (RPM ceiling)
  const capacity = acquireProviderCapacity("groq");
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
      provider: "groq",
      model: plannedModel,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      dataVersion,
      toolCalls: [],
      totalDurationMs: Date.now() - startTime,
      cacheHit: false,
      // Never reached a schema to validate - this is not "validation succeeded", it's "validation
      // never ran" (see the false uses below for the paths that actually did try and failed).
      validationSuccess: false,
      providerRPMCurrent: capacity.currentRPM,
      providerRPMLimit: capacity.limit,
      capacityExhausted: true,
      fallbackUsed: true,
      fallbackReason: "PROVIDER_RATE_LIMITED",
      errorCategory: "rate_limit",
    });

    return {
      data: fallback.data,
      generatedAt: new Date().toISOString(),
      dataVersion,
      agentType: "homepage_intelligence",
      modelIdentifier: plannedModel,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      isFallback: true,
      fallbackReason: "PROVIDER_RATE_LIMITED",
    };
  }

  // 2. Format compact prompt
  const contextString = buildHomepageContext(contextData);
  const messages = formatHomepagePrompt(contextString);

  const baseConfig = {
    maxTokens: config.provider?.maxTokens ?? HOMEPAGE_MAX_TOKENS,
    temperature: config.provider?.temperature ?? 0.7,
    // Own Groq account for this feature specifically - see groq.ts/providerFallback.ts's own
    // comments on why (isolation, not quota multiplication). Falls back to the shared GROQ_API_KEY
    // (handled inside GroqProvider itself) if this one isn't set.
    groqApiKey: process.env.GROQ_HOMEPAGE_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_HOMEPAGE_API_KEY,
  };

  // 3. Invoke provider (Groq -> OpenRouter fallback chain, see providerFallback.ts) - one retry
  // built into that chain already covers the "transient failure" case; this call site doesn't
  // add a second layer of retries on top of it.
  let rawContent: string | null = null;
  let provider = { name: "groq" };
  let model = plannedModel;
  let fallbackUsed = false;
  let fallbackReasonUsed: string | undefined;
  let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  let finishReason: string | undefined;
  const retryCount = 0;

  // Every failure path below now emits a real structured AIOperationLog (not just a bare
  // logAIError) - previously only the success and PROVIDER_RATE_LIMITED paths did, so a schema
  // failure or a final provider error was invisible to anything querying ai_operation logs.
  function logFailure(reason: string) {
    logAIOperation({
      requestId: ctx.requestId,
      agentType: "homepage_intelligence",
      userId: ctx.userId,
      provider: provider.name,
      model,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      dataVersion,
      toolCalls: [],
      totalDurationMs: Date.now() - startTime,
      tokenUsage,
      cacheHit: false,
      validationSuccess: false,
      finishReason,
      fallbackUsed: true,
      fallbackReason: reason,
      errorCategory: categorizeFallbackReason(reason),
    });
  }

  try {
    const result = await chatWithProviderFallback(messages, null, baseConfig, ctx.requestId);
    rawContent = result.response.content;
    tokenUsage = result.response.usage;
    finishReason = result.response.finishReason;
    provider = { name: result.providerName };
    model = result.model;
    fallbackUsed = result.fallbackUsed;
    fallbackReasonUsed = result.fallbackReason;
  } catch (err) {
    logAIError(ctx.requestId, "provider_failure_final", String(err));
    logAIOperation({
      requestId: ctx.requestId,
      agentType: "homepage_intelligence",
      userId: ctx.userId,
      provider: provider.name,
      model,
      promptVersion: HOMEPAGE_PROMPT_VERSION,
      dataVersion,
      toolCalls: [],
      totalDurationMs: Date.now() - startTime,
      cacheHit: false,
      validationSuccess: false,
      fallbackUsed: true,
      fallbackReason: "PROVIDER_ERROR",
      errorCategory: categorizeProviderError(err),
    });
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
    logFailure("EMPTY_RESPONSE");
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
      logFailure("SCHEMA_VALIDATION_FAILED");
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
      dataVersion,
      toolCalls: [],
      totalDurationMs: Date.now() - startTime,
      tokenUsage,
      cacheHit: false,
      validationSuccess: true,
      finishReason,
      providerRPMCurrent: capacity.currentRPM,
      providerRPMLimit: capacity.limit,
      retryCount,
      fallbackUsed,
      fallbackReason: fallbackReasonUsed,
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
    logFailure("JSON_PARSE_ERROR");
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

// ─── Race Intelligence ──────────────────────────────────────────────────────────
// Same single-bundled-call philosophy as generateHomepageIntelligence above, plus the
// partial-generation awareness the route's cache layer needs: a cold visit generates shared+
// personal together (one call); a later personal-only miss (shared already cached and valid) uses
// the smaller formatPersonalOnlyPrompt instead of redundantly regenerating shared content.
export interface RaceIntelligenceGenerationResult {
  shared: { data: SharedRaceIntelligence; generationMode: "ai" | "deterministic" } | null;
  personal: { data: PersonalRaceInsight | null; generationMode: "ai" | "deterministic" } | null;
}

export async function generateRaceIntelligence(
  context: RaceIntelligenceContext,
  ctx: AgentContext,
  options: { needShared: boolean; needPersonal: boolean; existingSharedHeadline?: string },
): Promise<RaceIntelligenceGenerationResult> {
  const startTime = Date.now();
  const wantsPersonal = options.needPersonal && hasPersonalContext(context);

  const toDeterministicResult = (): RaceIntelligenceGenerationResult => {
    const fallback = generateDeterministicRaceFallback(context);
    return {
      shared: options.needShared ? { data: fallback.shared, generationMode: "deterministic" } : null,
      personal: wantsPersonal ? { data: fallback.personal, generationMode: "deterministic" } : null,
    };
  };

  // Attempted-provider label for logging only - not yet known which provider will actually serve
  // this (chatWithProviderFallback resolves that); mirrors generateHomepageIntelligence's
  // plannedModel convention.
  const plannedModel = "groq/openai/gpt-oss-120b";

  const capacity = acquireProviderCapacity("groq");
  if (!capacity.allowed) {
    logDeterministicFallback(ctx.requestId, "PROVIDER_RATE_LIMITED", { currentRPM: capacity.currentRPM, limit: capacity.limit, retryAfterSeconds: capacity.retryAfterSeconds });
    logAIOperation({
      requestId: ctx.requestId,
      agentType: "race_intelligence",
      userId: ctx.userId,
      provider: "groq",
      model: plannedModel,
      promptVersion: RACE_INTELLIGENCE_PROMPT_VERSION,
      dataVersion: ctx.dataVersion,
      toolCalls: [],
      totalDurationMs: Date.now() - startTime,
      cacheHit: false,
      validationSuccess: false,
      providerRPMCurrent: capacity.currentRPM,
      providerRPMLimit: capacity.limit,
      capacityExhausted: true,
      fallbackUsed: true,
      fallbackReason: "PROVIDER_RATE_LIMITED",
      errorCategory: "rate_limit",
    });
    return toDeterministicResult();
  }

  // Own Groq account for this feature specifically - see groq.ts/providerFallback.ts's own
  // comments on why (isolation, not quota multiplication). Falls back to the shared GROQ_API_KEY
  // (handled inside GroqProvider itself) if this one isn't set.
  const baseConfig = {
    maxTokens: RACE_INTELLIGENCE_MAX_TOKENS,
    temperature: 0.7,
    groqApiKey: process.env.GROQ_RACE_INTELLIGENCE_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_RACE_INTELLIGENCE_API_KEY,
  };

  try {
    if (options.needShared) {
      // Full call: shared (+ personal together, when real personal context exists).
      const structuredContext = formatRaceIntelligenceContext(context, wantsPersonal);
      const messages = formatRaceIntelligencePrompt(structuredContext);
      const result = await chatWithProviderFallback(messages, null, baseConfig, ctx.requestId);
      if (!result.response.content) throw new Error("EMPTY_RESPONSE");

      const parsed = JSON.parse(cleanJsonOutput(result.response.content));
      const validation = validateRaceIntelligenceResult(parsed, context.evidenceFacts);
      if (!validation.valid || !validation.data) {
        logAIError(ctx.requestId, "race_validation_failure", "Failed to validate race intelligence output", { errors: validation.errors });
        throw new Error("SCHEMA_VALIDATION_FAILED");
      }

      logAIOperation({
        requestId: ctx.requestId,
        agentType: "race_intelligence",
        userId: ctx.userId,
        provider: result.providerName,
        model: result.model,
        promptVersion: RACE_INTELLIGENCE_PROMPT_VERSION,
        dataVersion: ctx.dataVersion,
        toolCalls: [],
        totalDurationMs: Date.now() - startTime,
        tokenUsage: result.response.usage,
        cacheHit: false,
        validationSuccess: true,
        finishReason: result.response.finishReason,
        fallbackUsed: result.fallbackUsed,
        fallbackReason: result.fallbackReason,
      });

      return {
        shared: { data: validation.data.shared, generationMode: "ai" },
        personal: wantsPersonal ? { data: validation.data.personal, generationMode: "ai" } : null,
      };
    }

    if (wantsPersonal) {
      // Smaller call: personal only, shared already cached and valid - passed in as read-only
      // context so the model doesn't need to regenerate it (see formatPersonalOnlyPrompt).
      const structuredContext = formatRaceIntelligenceContext(context, true);
      const messages = formatPersonalOnlyPrompt(structuredContext, options.existingSharedHeadline ?? context.race.name);
      const result = await chatWithProviderFallback(messages, null, baseConfig, ctx.requestId);
      if (!result.response.content) throw new Error("EMPTY_RESPONSE");

      const parsed = JSON.parse(cleanJsonOutput(result.response.content));
      const validation = validatePersonalOnlyResult(parsed, context.evidenceFacts);
      if (!validation.valid || !validation.data) {
        logAIError(ctx.requestId, "race_personal_validation_failure", "Failed to validate personal-only output", { errors: validation.errors });
        throw new Error("SCHEMA_VALIDATION_FAILED");
      }

      logAIOperation({
        requestId: ctx.requestId,
        agentType: "race_intelligence",
        userId: ctx.userId,
        provider: result.providerName,
        model: result.model,
        promptVersion: RACE_INTELLIGENCE_PROMPT_VERSION,
        dataVersion: ctx.dataVersion,
        toolCalls: [],
        totalDurationMs: Date.now() - startTime,
        tokenUsage: result.response.usage,
        cacheHit: false,
        validationSuccess: true,
        finishReason: result.response.finishReason,
        fallbackUsed: result.fallbackUsed,
        fallbackReason: result.fallbackReason,
      });

      return { shared: null, personal: { data: validation.data, generationMode: "ai" } };
    }

    return { shared: null, personal: null };
  } catch (err) {
    logAIError(ctx.requestId, "race_intelligence_generation_failed", String(err));
    // Distinguish this app's own sentinel EMPTY_RESPONSE/SCHEMA_VALIDATION_FAILED throws (a real
    // provider response was received but rejected downstream) from an actual transport-level error
    // bubbling up from chatWithProviderFallback (both providers failed) - each gets its own
    // errorCategory rather than one blanket "provider_error" for every failure in this function.
    const reason = err instanceof Error && (err.message === "EMPTY_RESPONSE" || err.message === "SCHEMA_VALIDATION_FAILED") ? err.message : "PROVIDER_ERROR";
    logAIOperation({
      requestId: ctx.requestId,
      agentType: "race_intelligence",
      userId: ctx.userId,
      provider: "groq",
      model: plannedModel,
      promptVersion: RACE_INTELLIGENCE_PROMPT_VERSION,
      dataVersion: ctx.dataVersion,
      toolCalls: [],
      totalDurationMs: Date.now() - startTime,
      cacheHit: false,
      validationSuccess: false,
      fallbackUsed: true,
      fallbackReason: reason,
      errorCategory: reason === "PROVIDER_ERROR" ? categorizeProviderError(err) : categorizeFallbackReason(reason),
    });
    return toDeterministicResult();
  }
}
