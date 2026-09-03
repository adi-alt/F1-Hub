import { NextResponse } from "next/server";
import { moderatePost } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, postId } = await params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: "approve" | "reject" };
  if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  try {
    await moderatePost(id, postId, session.uid, action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
