import { NextResponse } from "next/server";
import { decideJoinRequest } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, userId } = await params;
  const { decision } = (await request.json().catch(() => ({}))) as { decision?: "approve" | "reject" };
  if (decision !== "approve" && decision !== "reject") return NextResponse.json({ error: "Unknown decision" }, { status: 400 });

  try {
    await decideJoinRequest(id, session.uid, userId, decision);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
