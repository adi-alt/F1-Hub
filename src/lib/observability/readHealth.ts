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

/** What the site-wide stale-data notice shows (staleData), cached for five minutes; empty if it can't be read. */
export async function getStaleData(): Promise<ReturnType<typeof staleData>> {
  try {
    return await readStaleData();
  } catch {
    return [];
  }
}
