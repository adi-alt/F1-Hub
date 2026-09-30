import { NextResponse } from "next/server";
import { unbanMember } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { isUuid } from "@/lib/ids";
import { ServiceError, serviceErrorBody } from "@/services/errors";

/** Lifts a ban. Admins only. The person is not re-added; they can join again per the community's rules. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, userId } = await params;
  if (!isUuid(id) || !isUuid(userId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    await unbanMember(id, session.uid, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
