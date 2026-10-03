import { NextResponse } from "next/server";
import { createGroupInvite, listGroupInvites } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { isUuid } from "@/lib/ids";
import { ServiceError, serviceErrorBody } from "@/services/errors";

/** Live invitation links for a community. Only members with the community's "invite" permission. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Community not found." }, { status: 404 });
  try {
    return NextResponse.json({ invites: await listGroupInvites(id, session.uid) });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}

/** Creates a signed, expiring, revocable invitation link (default 7 days, 10 uses). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "invite", session.uid);
  if (limited) return limited;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Community not found." }, { status: 404 });
  const { expiresInDays, maxUses } = (await request.json().catch(() => ({}))) as { expiresInDays?: number; maxUses?: number };
  try {
    return NextResponse.json(await createGroupInvite(id, session.uid, { expiresInDays, maxUses }));
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
