import { cache } from "react";
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluateHealth, staleData, type Health, type PipelineRunRow } from "@/lib/observability/health";

/** The site's health from pipeline_runs, as /api/health reports it: never cached, for monitors. */
export async function readHealth(now = new Date()): Promise<Health> {
  let database: "ok" | "error" = "ok";
  let rows: PipelineRunRow[] = [];
  try {
    // The last 200 runs: enough to find each job's last success and its failure streak.
    const { data, error } = await supabaseAdmin.from("pipeline_runs").select("job, status, started_at, finished_at").order("started_at", { ascending: false }).limit(200);
    if (error) throw error;
    rows = (data ?? []) as PipelineRunRow[];
  } catch {
    database = "error";
  }
  return evaluateHealth(rows, database, now);
}

const readStaleData = unstable_cache(async () => staleData(await readHealth()), ["stale-data-notice"], { revalidate: 300 });

let memoryStaleCache: { val: ReturnType<typeof staleData>; exp: number } | null = null;
const STALE_MEMORY_TTL_MS = 60_000;

/** What the site-wide stale-data notice shows (staleData), cached for five minutes; empty if it can't be read.
 * Deduplicated per-request via React.cache and backed by short 60s in-memory caching on warm containers. */
export const getStaleData = cache(async function getStaleData(): Promise<ReturnType<typeof staleData>> {
  const now = Date.now();
  if (memoryStaleCache && memoryStaleCache.exp > now) {
    return memoryStaleCache.val;
  }
  try {
    const res = await readStaleData();
    memoryStaleCache = { val: res, exp: now + STALE_MEMORY_TTL_MS };
    return res;
  } catch {
    return [];
  }
});
