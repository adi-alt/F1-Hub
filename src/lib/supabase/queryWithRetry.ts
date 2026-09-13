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

const PAGE_SIZE = 1000; // this Supabase project's own server-side max-rows cap - confirmed live
// against the actual API (a `.range(0, 4999)` request still comes back "content-range: 0-999/*"),
// not a client-side default that `.range()` alone can raise. A single unfiltered `.select()` on
// any table with more than 1000 rows silently returns only the first 1000 unless the caller loops
// past this - archive_races (1,149 rows) and archive_results (25,701) both already exceed it.

/** Fetches every row of a query PostgREST would otherwise truncate at PAGE_SIZE.
 *
 * `buildQuery(from, to)` should apply that exact range to the same base query on each call - e.g.
 * `(from, to) => supabaseAdmin.from("archive_races").select("year").range(from, to)`. Pass
 * `{ count: "exact" }` in the `.select()` call and the response carries the *total* row count
 * alongside the first page's data - when it does, every remaining page is fetched in parallel
 * (`Promise.all`, not a sequential loop), since the total is already known up front. That's the
 * difference between ~26 round trips in series and ~26 in parallel for archive_results' 25,701
 * rows - confirmed live as the dominant cost in Archive's cold-cache load time. Without `count`
 * (older call sites, or PostgREST configs that don't support it), this falls back to the original
 * sequential "fetch a page, keep going until one comes back short" loop. Every page still goes
 * through queryWithRetry individually, so a transient blip mid-scan retries just that page, not
 * the whole fetch from the start. */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: SupabaseQueryError | null; count?: number | null }>,
): Promise<{ data: T[]; error: SupabaseQueryError | null }> {
  const first = await queryWithRetry(() => buildQuery(0, PAGE_SIZE - 1));
  if (first.error) return { data: [], error: first.error };
  const firstPage = first.data ?? [];

  if (typeof first.count === "number" && first.count > firstPage.length) {
    const totalPages = Math.ceil(first.count / PAGE_SIZE);
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => {
        const from = (i + 1) * PAGE_SIZE;
        return queryWithRetry(() => buildQuery(from, from + PAGE_SIZE - 1));
      }),
    );
    const failed = rest.find((r) => r.error);
    if (failed) return { data: firstPage, error: failed.error };
    return { data: [...firstPage, ...rest.flatMap((r) => r.data ?? [])], error: null };
  }

  // No usable count - fall back to sequential paging from where the first page left off.
  if (firstPage.length < PAGE_SIZE) return { data: firstPage, error: null };
  const all = [...firstPage];
  let from = PAGE_SIZE;
  for (;;) {
    const { data, error } = await queryWithRetry(() => buildQuery(from, from + PAGE_SIZE - 1));
    if (error) return { data: all, error };
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) return { data: all, error: null };
    from += PAGE_SIZE;
  }
}
