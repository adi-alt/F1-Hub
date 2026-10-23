import { NextResponse } from "next/server";
import { resolveReport } from "@/lib/supabase/moderation";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** A moderator dismisses a report, or removes what it reports. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, reportId } = await params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action !== "dismiss" && action !== "remove") return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  try {
    await resolveReport(id, reportId, session.uid, action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
