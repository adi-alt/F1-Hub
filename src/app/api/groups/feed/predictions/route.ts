import { NextResponse } from "next/server";
import { listMyPredictions } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";

/** Groups home's right-sidebar "Active Predictions" widget - open predictions across every group
 * the user has joined. Entering still happens in the real group's own Predictions tab.
 * listMyPredictions also returns recently-resolved rounds for callers that want them (the main
 * feed); filtered back down to "open" here since this route's whole point is the active ones. */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const predictions = (await listMyPredictions(session.uid)).filter((p) => p.status === "open");
  return NextResponse.json({ predictions });
}
