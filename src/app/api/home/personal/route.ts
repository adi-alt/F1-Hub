import { NextResponse } from "next/server";
import { getPersonalHomeData } from "@/lib/homeData";
import { getSession } from "@/lib/session/getSession";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";

/** Client-side refetch path for HomeShell's post-mount-login case — the initial signed-in render
 * already gets this from page.tsx's own server-side call; this route exists only so a login that
 * happens *after* the homepage is already mounted can pull the same bundle without a reload. */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const year = new Date().getFullYear();
  const [nextRace, races] = await Promise.all([getNextUpcomingRace(year), getRacesByYear(year)]);
  const data = await getPersonalHomeData(session.uid, year, nextRace, races);
  return NextResponse.json(data);
}
