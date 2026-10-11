import { NextResponse } from "next/server";
import { stampGroupVisit } from "@/lib/supabase/groupStats";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { isUuid } from "@/lib/ids";

/** Marks the end of a visit to a community: "since your last visit" counts from here. Sent by the
 * page when it is left or hidden (GroupVisitBeacon), never on render - a re-render (a realtime
 * refresh, a mutation) used to stamp a new visit and reset the window mid-visit. Only members have
 * a row to update, so anyone else is a no-op. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "groupVisit", session.uid);
  if (limited) return limited;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await stampGroupVisit(id, session.uid);
  return NextResponse.json({ ok: true });
}
