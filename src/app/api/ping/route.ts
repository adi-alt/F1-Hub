import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight, zero-overhead health/uptime ping endpoint.
 *
 * Designed specifically for external monitors (UptimeRobot, BetterStack, StatusCake, Pingdom)
 * so they don't ping the dynamic SSR homepage (`/`) and trigger heavy `unstable_cache` reads.
 *
 * - Zero database connections.
 * - Zero Next.js Data Cache reads.
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString() },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json",
      },
    },
  );
}

