import { NextResponse } from "next/server";
import { listMyOpenPredictions } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";

/** Groups home's right-sidebar "Active Predictions" widget - open predictions across every group
 * the user has joined. Entering still happens in the real group's own Predictions tab. */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const predictions = await listMyOpenPredictions(session.uid);
  return NextResponse.json({ predictions });
}
