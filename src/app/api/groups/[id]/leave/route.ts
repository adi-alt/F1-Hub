import { NextResponse } from "next/server";
import { leaveGroup } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** Leaving is its own route rather than DELETE on members/[userId]: that one is the admin action
 * and requires admin, so a member calling it on themselves would be refused. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    await leaveGroup(id, session.uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
