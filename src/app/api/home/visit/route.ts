import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { touchHomepageVisit } from "@/lib/supabase/users";

/** Marks the end of a home visit: the next visit's "since your last visit" counts from here. Sent
 * by HomeVisitBeacon when the home is left or hidden, never on render or on an AI request - those
 * used to stamp "now" and collapse the window to nothing on the next refresh. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "homeVisit", session.uid);
  if (limited) return limited;
  await touchHomepageVisit(session.uid);
  return NextResponse.json({ ok: true });
}
