import { NextResponse } from "next/server";
import { muteMember, unmuteMember } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, userId } = await params;
  const { durationSeconds, reason } = (await request.json().catch(() => ({}))) as {
    durationSeconds?: number;
    reason?: string;
  };

  if (!durationSeconds || typeof durationSeconds !== "number" || durationSeconds <= 0) {
    return NextResponse.json({ error: "A positive mute duration is required." }, { status: 400 });
  }

  try {
    await muteMember(id, session.uid, userId, durationSeconds, reason);
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
    await unmuteMember(id, session.uid, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
