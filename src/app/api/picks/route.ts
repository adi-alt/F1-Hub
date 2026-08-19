import { NextResponse } from "next/server";
import { getUserPick, saveUserPick } from "@/lib/supabase/picks";
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

// PickPanel used to write this doc straight from the browser via the Firestore client SDK,
// relying on Firebase Auth's request.auth.uid to satisfy firestore.rules - now that sign-in
// doesn't touch Firebase Auth at all, that path has nothing to authenticate it with, so this
// route does the write instead, same session-cookie-derived uid every other write in this app
// already uses.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const { raceId, predictedWinner, predictedPodium } = body;
  if (
    typeof raceId !== "string" ||
    typeof predictedWinner !== "string" ||
    !Array.isArray(predictedPodium) ||
    predictedPodium.length !== 3 ||
    !predictedPodium.every((d) => typeof d === "string")
  ) {
    return NextResponse.json({ error: "Invalid pick" }, { status: 400 });
  }

  await saveUserPick(session.uid, {
    raceId,
    predictedWinner,
    predictedPodium: predictedPodium as [string, string, string],
    submittedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
