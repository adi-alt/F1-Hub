import { NextResponse } from "next/server";
import { revokeGroupInvite } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { isUuid } from "@/lib/ids";
import { ServiceError, serviceErrorBody } from "@/services/errors";

/** Cancels an invitation; the next attempt to use it is refused immediately. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, inviteId } = await params;
  if (!isUuid(id) || !isUuid(inviteId)) return NextResponse.json({ error: "That invitation doesn't exist." }, { status: 404 });
  try {
    await revokeGroupInvite(id, session.uid, inviteId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
