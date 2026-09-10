// Provider-level fallback chain: Groq (primary, ~1.7s real median) -> OpenRouter (secondary,
// ~4.3s real median) -> the caller's own deterministic fallback (unchanged - still the final
// safety net every existing call site already has). A real, live-tested policy, not a guess:
//
// - 429 (rate limited): skip retrying the same provider entirely, go straight to the next one -
//   retrying a rate limit just burns the whole timeout budget on a request that's going to fail
//   again.
// - Anything else (5xx, network error, timeout): one retry against the SAME provider first
//   (jittered ~300-700ms delay) - these are the transient-failure classes a retry can actually fix,
//   and Groq's own real numbers (1.65-1.87s, no wild tail like Muse Glimmer's history) make a
//   single retry cheap even in the worst case.
//
// This file only handles provider-transport-level failures. Empty responses, JSON parse errors,
// and schema validation failures are still the caller's problem - those already fall through to
// generateDeterministicFallback/generateDeterministicRaceFallback in orchestrator.ts, unchanged.
//
// `baseConfig.groqApiKey`/`openrouterApiKey` let each caller (homepage vs. race intelligence) use
// its own separate account on both providers - real per-service isolation, not an attempt to
// multiply either account's free-tier quota.

import { getDefaultProvider, getFallbackProvider, ProviderHttpError, type AIProvider } from "./provider";
import { GROQ_MODEL_ID } from "./groq";
import { OPENROUTER_FALLBACK_MODEL_ID } from "./openrouter";
import { logAIError } from "./telemetry";
import type { AIMessage, AIProviderConfig, AIProviderToolDef, AIResponse } from "./types";

const GROQ_TIMEOUT_MS = 8_000; // ~4.5x the highest of 5 real observed runs (1.87s) - not the 90s
// margin Muse Glimmer needed, because Groq's own real numbers show none of that provider's wild
// tail latency.
// 12s (the original ~1.5x margin on the 7.7s benchmark run) was NOT enough live: confirmed via a
// real forced-fallback test against the actual, much larger race-intelligence prompt (not the
// small synthetic benchmark prompt) - OpenRouter timed out at 12s and fell through to the
// deterministic result instead of a real completion. Bumped to 20s.
const OPENROUTER_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MIN_MS = 300;
const RETRY_DELAY_MAX_MS = 700;

function jitterDelay(): Promise<void> {
  const ms = RETRY_DELAY_MIN_MS + Math.random() * (RETRY_DELAY_MAX_MS - RETRY_DELAY_MIN_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(err: unknown): boolean {
  return err instanceof ProviderHttpError && err.status === 429;
}

export type ProviderChatResult = {
  response: AIResponse;
  providerName: string;
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: "PRIMARY_RATE_LIMITED" | "PRIMARY_ERROR";
};

/** Runs one chat completion through the Groq -> OpenRouter chain. Throws only once BOTH providers
 * have failed - the caller's existing try/catch (already turning a thrown error into a
 * deterministic result) is the final safety net, unchanged by this file. */
export async function chatWithProviderFallback(
  messages: AIMessage[],
  tools: AIProviderToolDef[] | null,
  baseConfig: { maxTokens: number; temperature: number; topP?: number; groqApiKey?: string; openrouterApiKey?: string },
  requestId: string,
): Promise<ProviderChatResult> {
  const { groqApiKey, openrouterApiKey, ...generationConfig } = baseConfig;
  const primary = getDefaultProvider();
  const primaryConfig: AIProviderConfig = { ...generationConfig, model: GROQ_MODEL_ID, timeoutMs: GROQ_TIMEOUT_MS, apiKey: groqApiKey };

  async function attempt(provider: AIProvider, config: AIProviderConfig): Promise<AIResponse> {
    return provider.chat(messages, tools, config);
  }

  let primaryErr: unknown;
  try {
    const response = await attempt(primary, primaryConfig);
    return { response, providerName: primary.name, model: primaryConfig.model, fallbackUsed: false };
  } catch (err) {
    primaryErr = err;
  }

  if (!isRateLimited(primaryErr)) {
    // Transient (5xx/timeout/network) - one retry against the same provider before giving up on it.
    await jitterDelay();
    try {
      const response = await attempt(primary, primaryConfig);
      return { response, providerName: primary.name, model: primaryConfig.model, fallbackUsed: false };
    } catch (retryErr) {
      logAIError(requestId, "provider_primary_retry_failed", String(retryErr));
    }
  } else {
    logAIError(requestId, "provider_primary_rate_limited", String(primaryErr));
  }

  // Primary exhausted (rate-limited, or a retry that also failed) - try the secondary provider.
  const secondary = getFallbackProvider();
  const secondaryConfig: AIProviderConfig = { ...generationConfig, model: OPENROUTER_FALLBACK_MODEL_ID, timeoutMs: OPENROUTER_TIMEOUT_MS, apiKey: openrouterApiKey };
  try {
    const response = await attempt(secondary, secondaryConfig);
    return {
      response,
      providerName: secondary.name,
      model: secondaryConfig.model,
      fallbackUsed: true,
      fallbackReason: isRateLimited(primaryErr) ? "PRIMARY_RATE_LIMITED" : "PRIMARY_ERROR",
    };
  } catch (secondaryErr) {
    logAIError(requestId, "provider_secondary_failed", String(secondaryErr));
    throw secondaryErr;
  }
}
