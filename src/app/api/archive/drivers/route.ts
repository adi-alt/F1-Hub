import { NextResponse } from "next/server";
import { getAllArchiveDriversData } from "@/app/archive/services/archive.service";
import { getSession } from "@/lib/session/getSession";

/** Backs useArchiveDrivers - the "By driver" tab's own 805-row list, previously fetched eagerly on
 * every Archive load regardless of which tab was actually open. Same session-check shape
 * /api/archive/laps already uses (archive's own page checks getSession()/SignInGate before it ever
 * renders; a directly-callable route needs its own check since nothing else gates it). */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const drivers = await getAllArchiveDriversData();
  return NextResponse.json({ drivers });
}
