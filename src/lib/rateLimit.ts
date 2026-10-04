import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/clientIp";

export { clientIp };

/**
 * Durable rate limiting (audit R-14, SEC-13): counters in Postgres (rate_limit_hit), so a limit holds
 * across every serverless instance and survives a deploy. Replaces the per-instance, in-memory limiter,
 * which let anyone through by reaching a different instance.
 *
 * Every policy is named here, in one place, with the reasoning for its numbers. `by` says what the
 * limit is keyed on: a signed-in user's id, or the client's IP for a route anyone can call.
 */
export type Policy = { limit: number; windowSeconds: number; by: "user" | "ip" };

export const POLICIES = {
  // AI: a burst limit and a daily budget per user, and an IP limit for anyone not signed in.
  aiBurst: { limit: 10, windowSeconds: 60, by: "user" },
  aiDaily: { limit: 200, windowSeconds: 86_400, by: "user" },
  aiAnonymous: { limit: 20, windowSeconds: 3_600, by: "ip" },
  // Reads that call out to a third party or run many queries.
  usernameCheck: { limit: 30, windowSeconds: 60, by: "ip" },
  linkPreview: { limit: 30, windowSeconds: 60, by: "user" },
  gifSearch: { limit: 60, windowSeconds: 60, by: "user" },
  // Writes that fill the feed or send mail: well above what a person does, well below a script.
  postCreate: { limit: 10, windowSeconds: 60, by: "user" },
  commentCreate: { limit: 20, windowSeconds: 60, by: "user" },
  vote: { limit: 60, windowSeconds: 60, by: "user" },
  groupCreate: { limit: 5, windowSeconds: 3_600, by: "user" },
  groupJoin: { limit: 30, windowSeconds: 3_600, by: "user" },
  predictionCreate: { limit: 20, windowSeconds: 3_600, by: "user" },
  invite: { limit: 20, windowSeconds: 86_400, by: "user" },
  upload: { limit: 20, windowSeconds: 3_600, by: "user" },
  // A beacon when a community page is left or hidden: a person flips tabs a few times a minute at most.
  groupVisit: { limit: 60, windowSeconds: 3_600, by: "user" },
} as const satisfies Record<string, Policy>;

export type PolicyName = keyof typeof POLICIES;

export type LimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Counts one hit against `policy` for `subject` and says whether it is within the limit.
 *
 * Fails OPEN when the database can't be reached: a limiter outage must not become a site outage, and
 * the error is reported. Pass `failClosed` for something where letting a request through unchecked is
 * the bigger risk.
 */
export async function hit(policyName: PolicyName, subject: string, options: { failClosed?: boolean } = {}): Promise<LimitResult> {
  const policy: Policy = POLICIES[policyName];
  try {
    const { data, error } = await supabaseAdmin.rpc("rate_limit_hit", { p_key: `${policyName}:${subject}`, p_limit: policy.limit, p_window_seconds: policy.windowSeconds });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; retry_after_seconds: number } | undefined;
    if (!row) throw new Error("rate_limit_hit returned no row");
    return { allowed: row.allowed, retryAfterSeconds: row.allowed ? 0 : row.retry_after_seconds };
  } catch (err) {
    console.error(`rateLimit(${policyName}): limiter unavailable, failing ${options.failClosed ? "closed" : "open"}:`, err);
    Sentry.captureException(err, { tags: { area: "rate-limit", policy: policyName } });
    return options.failClosed ? { allowed: false, retryAfterSeconds: 30 } : { allowed: true, retryAfterSeconds: 0 };
  }
}

/** The 429 response for a limited request. */
export function tooManyRequests(retryAfterSeconds: number, message = "Too many requests. Try again shortly."): NextResponse {
  return NextResponse.json({ error: message, retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
}

/**
 * For route handlers: returns the 429 to send, or null to carry on.
 *   const limited = await limitRequest(request, "linkPreview", session.uid);
 *   if (limited) return limited;
 * A policy keyed on "user" with no uid falls back to the IP, so a missing session is never a free pass.
 */
export async function limitRequest(request: Request, policyName: PolicyName, uid?: string | null, options?: { failClosed?: boolean }): Promise<NextResponse | null> {
  const policy: Policy = POLICIES[policyName];
  const subject = policy.by === "user" && uid ? uid : clientIp(request);
  const result = await hit(policyName, subject, options);
  return result.allowed ? null : tooManyRequests(result.retryAfterSeconds);
}
