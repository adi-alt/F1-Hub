import { NextResponse } from "next/server";
import { readHealth } from "@/lib/observability/readHealth";

/**
 * GET /api/health - for uptime monitors and the heartbeat alert (audit R-13; .github/workflows/health-check.yml).
 * Public and cheap: it says whether the database answers and how old the last successful pipeline run is, nothing
 * about users. 200 when healthy, 503 when degraded, so a monitor that only looks at the status code still works.
 * Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await readHealth();
  return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
