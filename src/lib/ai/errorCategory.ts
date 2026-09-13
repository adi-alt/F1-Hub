// Maps real thrown errors and this app's own internal fallback-reason strings to one of a small,
// fixed set of error categories (types.ts's AIErrorCategory) - so a log query can group "why did
// this fall back" without parsing free-text error messages.

import { ProviderHttpError } from "./provider";
import type { AIErrorCategory } from "./types";

/** Categorizes a raw error thrown by the provider layer (chatWithProviderFallback / GroqProvider /
 * OpenRouterProvider) - the actual underlying transport-level cause. */
export function categorizeProviderError(err: unknown): AIErrorCategory {
  if (err instanceof ProviderHttpError) {
    if (err.status === 429) return "rate_limit";
    if (err.status === 401 || err.status === 403) return "authentication";
    if (err.status === 400 || err.status === 422) return "configuration";
    return "provider_error";
  }
  if (err instanceof Error) {
    if (err.name === "AbortError" || /timed out/i.test(err.message)) return "timeout";
    if (/environment variable is not configured/i.test(err.message)) return "configuration";
    if (/empty choices array/i.test(err.message)) return "invalid_response";
  }
  return "unknown";
}

/** Categorizes one of this app's own internal fallback-reason strings (the ones passed to
 * generateDeterministicFallback / logged as fallbackReason) - distinct from
 * categorizeProviderError, which categorizes a raw thrown error object instead. */
export function categorizeFallbackReason(reason: string): AIErrorCategory {
  switch (reason) {
    case "PROVIDER_RATE_LIMITED":
    case "USER_RATE_LIMITED":
      return "rate_limit";
    case "SCHEMA_VALIDATION_FAILED":
      return "schema_validation";
    case "EMPTY_RESPONSE":
    case "JSON_PARSE_ERROR":
      return "invalid_response";
    case "SERVER_EXCEPTION":
      return "unknown";
    default:
      return "deterministic_fallback";
  }
}
