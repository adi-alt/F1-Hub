import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluateHealth, type PipelineRunRow } from "@/lib/observability/health";

/**
 * GET /api/health - for uptime monitors and the heartbeat alert (audit R-13). Public and cheap: it says
 * whether the database answers and how old the last successful pipeline run is, nothing about users.
 * 200 when healthy, 503 when degraded, so a monitor that only looks at the status code still works.
 * Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
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
  const health = evaluateHealth(rows, database, new Date());
  return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
