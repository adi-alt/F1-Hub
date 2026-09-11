import { NextResponse } from "next/server";
import { listJoinRequests, requestToJoin } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** Admin/moderator view of who's waiting. requireMember + a role check live in the service layer,
 * same as every other group read. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ requests: await listJoinRequests(id, session.uid) });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

/** Ask to join a private community. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { message } = (await request.json().catch(() => ({}))) as { message?: string };
  try {
    return NextResponse.json(await requestToJoin(id, session.uid, message));
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

/** Withdraw your own pending request. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { cancelJoinRequest } = await import("@/lib/supabase/groups");
  await cancelJoinRequest(id, session.uid);
  return NextResponse.json({ ok: true });
}
