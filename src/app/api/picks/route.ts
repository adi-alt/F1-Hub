import { NextResponse } from "next/server";
import { getUserPick } from "@/lib/firestore/picks";
import { getSession } from "@/lib/session/getSession";

/**
 * Deliberately a separate dynamic endpoint rather than reading the session in the race page
 * itself: that page is ISR-cached (revalidate = 300) for performance, and touching cookies()
 * there would force it fully dynamic again. This tiny endpoint pays the per-request cost instead,
 * for a single small document rather than a whole season.
 */
export async function GET(request: Request) {
  const raceId = new URL(request.url).searchParams.get("raceId");
  if (!raceId) return NextResponse.json({ error: "Missing raceId" }, { status: 400 });

  const session = await getSession();
  if (!session.uid) return NextResponse.json({ pick: null });

  const pick = await getUserPick(session.uid, raceId);
  return NextResponse.json({ pick });
}
