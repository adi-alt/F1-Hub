import { NextResponse } from "next/server";
import { joinGroup } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { isUuid } from "@/lib/ids";
import { ServiceError, serviceErrorBody } from "@/services/errors";

/**
 * Join a community. A public one is joined directly; a private or hidden one needs a signed
 * invitation token (`{ inviteToken }`) - the community's id alone admits no one (audit SEC-06).
 * Without a token, a private community answers 403 with code "request_required" so the client can
 * offer "Request to join" instead.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "groupJoin", session.uid);
  if (limited) return limited;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "That invite link isn't valid.", code: "group_not_found" }, { status: 404 });
  const { inviteToken } = (await request.json().catch(() => ({}))) as { inviteToken?: unknown };
  if (inviteToken !== undefined && inviteToken !== null && typeof inviteToken !== "string") return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });

  try {
    const group = await joinGroup(session.uid, id, inviteToken as string | null | undefined);
    return NextResponse.json(group);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
