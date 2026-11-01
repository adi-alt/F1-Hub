import { NextResponse } from "next/server";
import { decideAllJoinRequests, listJoinRequests, requestToJoin } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { ServiceError, serviceErrorBody } from "@/services/errors";

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
  const limited = await limitRequest(request, "groupJoin", session.uid);
  if (limited) return limited;
  const { id } = await params;
  const { message } = (await request.json().catch(() => ({}))) as { message?: string };
  try {
    return NextResponse.json(await requestToJoin(id, session.uid, message));
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}

/** Bulk decide (approve or decline) all pending join requests. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: "approve_all" | "reject_all" };
  if (action !== "approve_all" && action !== "reject_all") {
    return NextResponse.json({ error: "Invalid action. Use approve_all or reject_all." }, { status: 400 });
  }

  try {
    const res = await decideAllJoinRequests(id, session.uid, action === "approve_all" ? "approve" : "reject");
    return NextResponse.json(res);
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
