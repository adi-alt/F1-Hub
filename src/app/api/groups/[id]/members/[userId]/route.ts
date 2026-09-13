import { NextResponse } from "next/server";
import { removeMember, updateMemberRole, type GroupRole } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, userId } = await params;
  const { role } = (await request.json().catch(() => ({}))) as { role?: GroupRole };
  if (role !== "admin" && role !== "moderator" && role !== "member") return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  try {
    await updateMemberRole(id, session.uid, userId, role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, userId } = await params;
  try {
    await removeMember(id, session.uid, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
