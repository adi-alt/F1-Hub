import { NextResponse } from "next/server";
import { getArchiveRaceLapsData } from "@/app/archive/services/archive.service";
import { getSession } from "@/lib/session/getSession";

/** Every other archive read is gated by the page's own getSession()/SignInGate check before it
 * ever renders — this is the first archive data exposed through a directly-callable route, so it
 * checks the same session itself rather than opening a gap the rest of archive doesn't have. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const round = Number(searchParams.get("round"));
  if (!year || !round) {
    return NextResponse.json({ error: "Missing or invalid year/round" }, { status: 400 });
  }

  const laps = await getArchiveRaceLapsData(year, round);
  return NextResponse.json({ laps });
}
