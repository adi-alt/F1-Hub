// Deterministic, Server-Side AI Guardrails.
// Enforces invariants before, during, and after agent and provider executions.
// Never relies on LLM "politeness" or prompt instructions alone.

import { ALLOWED_ACTION_TYPES, type NextActionType } from "./schemas/homepageIntelligence";
import { checkProviderCapacity } from "./providerRateLimiter";

/** The global AI kill switch (audit R-14): set AI_DISABLED=1 in the environment and no model is called;
 * every AI path serves its deterministic content instead. For a runaway bill or a misbehaving provider. */
export function isAiDisabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.AI_DISABLED ?? "");
}

export type QuotaResult = { allowed: boolean; retryAfterSeconds: number; reason?: "USER_RATE_LIMITED" | "AI_DISABLED" };

/**
 * The durable per-caller AI quota (audit R-14, SEC-13): a burst limit and a daily budget for a signed-in
 * user, and one IP limit for anyone who isn't. `identifier` is a user id, or `ip:<address>` for an
 * anonymous caller. Counters live in Postgres, so the limit holds across every serverless instance.
 * (The old limiter was an in-memory map per instance and skipped anonymous callers entirely.)
 */
export async function checkUserRateLimit(identifier: string): Promise<QuotaResult> {
  if (isAiDisabled()) return { allowed: false, retryAfterSeconds: 0, reason: "AI_DISABLED" };
  // Imported on use: the limiter needs the database client, which importing this module for its pure
  // helpers (sanitizePromptInput and friends) must not require.
  const { hit } = await import("@/lib/rateLimit");
  const checks = identifier.startsWith("ip:")
    ? ([["aiAnonymous", identifier.slice(3)]] as const)
    : ([
        ["aiBurst", identifier],
        ["aiDaily", identifier],
      ] as const);
  for (const [policy, subject] of checks) {
    const result = await hit(policy, subject);
    if (!result.allowed) return { allowed: false, retryAfterSeconds: result.retryAfterSeconds, reason: "USER_RATE_LIMITED" };
  }
  return { allowed: true, retryAfterSeconds: 0 };
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
 * Guard check combining the durable user quota with provider capacity. `caller` is the request, for
 * the IP limit when nobody is signed in.
 */
export async function guardAIExecution(
  userId: string | null,
  caller?: Request,
): Promise<{
  allowed: boolean;
  reason?: "USER_RATE_LIMITED" | "PROVIDER_RATE_LIMITED" | "AI_DISABLED";
  retryAfterSeconds?: number;
}> {
  if (isAiDisabled()) return { allowed: false, reason: "AI_DISABLED", retryAfterSeconds: 0 };

  // 1. The caller's own quota: by user id, or by IP when there is no session.
  const { clientIp } = await import("@/lib/clientIp");
  const identifier = userId ?? `ip:${caller ? clientIp(caller) : "unknown"}`;
  const userCheck = await checkUserRateLimit(identifier);
  if (!userCheck.allowed) {
    return { allowed: false, reason: userCheck.reason ?? "USER_RATE_LIMITED", retryAfterSeconds: userCheck.retryAfterSeconds };
  }

  // 2. The provider's capacity: this protects the provider's own quota from everyone's traffic together.
  const providerCheck = checkProviderCapacity("groq");
  if (!providerCheck.allowed) {
    return { allowed: false, reason: "PROVIDER_RATE_LIMITED", retryAfterSeconds: providerCheck.retryAfterSeconds };
  }

  return { allowed: true };
}
