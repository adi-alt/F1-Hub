import { NextResponse } from "next/server";
import { readHealth } from "@/lib/observability/readHealth";
import { getSiteAdmin } from "@/lib/siteAdmin";

/**
 * GET /api/health - site and pipeline health status.
 * Restricted to site admins (via session) and authorized automation (via x-cron-secret).
 * Anyone else receives 401 Unauthorized.
 * 200 when healthy, 503 when degraded. Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  const isCronAuthorized = !!(process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);

  if (!isCronAuthorized) {
    const admin = await getSiteAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const health = await readHealth();
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
