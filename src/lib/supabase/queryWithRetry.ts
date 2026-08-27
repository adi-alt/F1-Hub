/**
 * Retries a Supabase/PostgREST query on a *transient* failure (a network blip, the connection
 * pool briefly maxed out, the DB going briefly unavailable) before giving up — and throws
 * immediately, with no retry, on anything else (a bad query, a missing table/column, an RLS/
 * permission failure). A PostgREST call resolves with `{ data: null, error }` rather than
 * throwing, so a plain try/catch retry wrapper wouldn't see the failure at all - this inspects
 * the result's own `error` field instead.
 *
 * Retrying a permission/schema/programming error wastes time and hides a real bug behind a delay
 * that never resolves it - only connection/timeout-class Postgres error codes (SQLSTATE class 08
 * "connection_exception", class 53 "insufficient_resources", 57P03 "cannot_connect_now") or a
 * network-level failure message count as transient here. Same reasoning as
 * pipeline/ergast_utils.py's own with_retry: a real outage still throws after `attempts` is
 * exhausted, same as before this existed.
 *
 * Bounded exponential backoff + jitter, not linear - `baseDelayMs * 2^attempt` capped at
 * `maxDelayMs`, plus up to 30% random jitter so many concurrent callers retrying the same brief
 * outage don't all hammer the DB again in lockstep the moment it recovers.
 */
export type SupabaseQueryError = { message: string; code?: string };

const TRANSIENT_CODE_PREFIXES = ["08", "53", "57P03"];
const TRANSIENT_MESSAGE_HINTS = ["timeout", "timed out", "fetch failed", "network", "econnreset", "etimedout", "econnrefused"];

export function isTransientQueryError(error: SupabaseQueryError): boolean {
  if (error.code && TRANSIENT_CODE_PREFIXES.some((prefix) => error.code!.startsWith(prefix))) return true;
  const message = error.message.toLowerCase();
  return TRANSIENT_MESSAGE_HINTS.some((hint) => message.includes(hint));
}

// Generic over the *whole* PostgREST response shape (not just `{ data, error }`) so call sites
// that also read `count` (a `{ count: "exact", head: true }` query) keep that field typed after
// going through this wrapper - only `error`'s shape is actually constrained.
export async function queryWithRetry<R extends { error: SupabaseQueryError | null }>(
  run: () => PromiseLike<R>,
  { attempts = 3, baseDelayMs = 200, maxDelayMs = 2000 }: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number } = {},
): Promise<R> {
  let result = await run();
  for (let attempt = 1; attempt < attempts && result.error && isTransientQueryError(result.error); attempt++) {
    const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    const jitter = Math.random() * backoff * 0.3;
    await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    result = await run();
  }
  return result;
}
