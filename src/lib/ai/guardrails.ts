// Deterministic, Server-Side AI Guardrails.
// Enforces invariants before, during, and after agent and provider executions.
// Never relies on LLM "politeness" or prompt instructions alone.

import { ALLOWED_ACTION_TYPES, type NextActionType } from "./schemas/homepageIntelligence";
import { checkProviderCapacity } from "./providerRateLimiter";

const userRateBuckets = new Map<string, number[]>();
const USER_RATE_WINDOW_MS = 60_000;
const MAX_USER_REQUESTS_PER_MINUTE = 10;

/**
 * Check and record client-level rate limit (per user or IP).
 */
export function checkUserRateLimit(identifier: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let timestamps = userRateBuckets.get(identifier);
  if (!timestamps) {
    timestamps = [];
    userRateBuckets.set(identifier, timestamps);
  }

  // Prune expired timestamps
  const cutoff = now - USER_RATE_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= MAX_USER_REQUESTS_PER_MINUTE) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + USER_RATE_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Reset user rate limit tracking (primarily for tests).
 */
export function resetUserRateLimiter(): void {
  userRateBuckets.clear();
}

/**
 * Validates whether an actionType returned by the model is authorized.
 */
export function sanitizeActionType(actionType: unknown): NextActionType {
  if (typeof actionType === "string" && (ALLOWED_ACTION_TYPES as readonly string[]).includes(actionType)) {
    return actionType as NextActionType;
  }
  return "MAKE_PREDICTION";
}

/**
 * Bounded input sanitizer to prevent token bloat or injection.
 */
export function sanitizePromptInput(input: string, maxLength = 8000): string {
  if (!input) return "";
  return input.slice(0, maxLength).trim();
}

/**
 * Guard check combining user quota with provider capacity.
 */
export function guardAIExecution(userId: string | null): {
  allowed: boolean;
  reason?: "USER_RATE_LIMITED" | "PROVIDER_RATE_LIMITED";
  retryAfterSeconds?: number;
} {
  // 1. Check user rate limit if userId or client identifier is provided
  if (userId) {
    const userCheck = checkUserRateLimit(userId);
    if (!userCheck.allowed) {
      return {
        allowed: false,
        reason: "USER_RATE_LIMITED",
        retryAfterSeconds: userCheck.retryAfterSeconds,
      };
    }
  }

  // 2. Check provider capacity (NVIDIA 40 RPM ceiling)
  const providerCheck = checkProviderCapacity("nvidia");
  if (!providerCheck.allowed) {
    return {
      allowed: false,
      reason: "PROVIDER_RATE_LIMITED",
      retryAfterSeconds: providerCheck.retryAfterSeconds,
    };
  }

  return { allowed: true };
}
