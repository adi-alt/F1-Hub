import { NextResponse } from "next/server";
import { getRaceLaps } from "@/lib/supabase/races";
import { getSession } from "@/lib/session/getSession";

/** Season's equivalent of /api/archive/laps - same on-demand shape (LapChart mounts, fetches
 * once), same session gate, different table (race_laps, via getRaceLaps). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const round = Number(searchParams.get("round"));
  if (!year || !round) {
    return NextResponse.json({ error: "Missing or invalid year/round" }, { status: 400 });
  }

  const laps = await getRaceLaps(year, round);
  return NextResponse.json({ laps });
}
