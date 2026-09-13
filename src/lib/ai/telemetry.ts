// Structured logging for AI operations — every agent invocation, tool call, cache check,
// provider capacity check, and validation result is logged as structured JSON.
// Vercel's log drain captures console.log output, giving production-grade observability
// without third-party SaaS dependencies.
//
// NEVER logs: API keys, raw system prompts, sensitive user data, full community post content.
// DOES log: request ID, agent type, tool names, durations, token usage, cache hit/miss,
// provider rolling RPM, capacity status, fallback reasons, validation success/failure.

import type { AIOperationLog } from "./types";

/** Log a completed AI operation. */
export function logAIOperation(log: AIOperationLog): void {
  console.log(JSON.stringify({ _tag: "ai_operation", ...log }));
}

/** Log a provider rate limit or capacity check event. */
export function logProviderRequest(
  provider: string,
  model: string,
  status: "capacity_acquired" | "rate_limited" | "success" | "error",
  currentRPM: number,
  limit: number,
  latencyMs?: number,
  extra?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      _tag: "ai_provider_capacity",
      provider,
      model,
      status,
      currentRPM,
      limit,
      capacityUtilizationPct: Math.round((currentRPM / limit) * 100),
      ...(latencyMs !== undefined && { latencyMs }),
      ...extra,
    }),
  );
}

/** Log a fallback invocation when provider limit is reached or model is unavailable. */
export function logDeterministicFallback(
  requestId: string,
  reason: string,
  details?: Record<string, unknown>,
): void {
  console.warn(
    JSON.stringify({
      _tag: "ai_deterministic_fallback",
      requestId,
      reason,
      ...details,
    }),
  );
}

/** Log a single tool execution within an agent run. */
export function logToolCall(
  requestId: string,
  toolName: string,
  durationMs: number,
  success: boolean,
  errorMessage?: string,
): void {
  console.log(
    JSON.stringify({
      _tag: "ai_tool_call",
      requestId,
      toolName,
      durationMs,
      success,
      ...(errorMessage && { error: errorMessage }),
    }),
  );
}

/** Log an AI-related error without exposing secrets. */
export function logAIError(
  requestId: string,
  category: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  console.error(
    JSON.stringify({
      _tag: "ai_error",
      requestId,
      category,
      message,
      ...extra,
    }),
  );
}

/** Log a cache event (hit_global, hit_personal, miss, write, expired). */
export function logCacheEvent(
  requestId: string,
  event: "hit_global" | "hit_personal" | "miss" | "write" | "expired",
  cacheKey: string,
): void {
  console.log(
    JSON.stringify({
      _tag: "ai_cache",
      requestId,
      event,
      cacheKey: cacheKey.length > 120 ? cacheKey.slice(0, 120) + "…" : cacheKey,
    }),
  );
}
