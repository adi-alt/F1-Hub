import { NextResponse } from "next/server";
import { getAllArchiveTeamsData } from "@/app/archive/services/archive.service";
import { getSession } from "@/lib/session/getSession";

/** Backs useArchiveTeams - the "By team" tab's own 171-row list, previously fetched eagerly on
 * every Archive load regardless of which tab was actually open. Same shape as
 * /api/archive/drivers/route.ts (which itself matches /api/archive/laps' own pattern). */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const teams = await getAllArchiveTeamsData();
  return NextResponse.json({ teams });
}
