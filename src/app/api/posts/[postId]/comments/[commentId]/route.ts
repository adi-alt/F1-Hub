import { NextResponse } from "next/server";
import { deleteComment, editComment } from "@/lib/supabase/moderation";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** The author edits their comment. */
export async function PATCH(request: Request, { params }: { params: Promise<{ postId: string; commentId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId, commentId } = await params;
  const { content } = (await request.json().catch(() => ({}))) as { content?: string };
  if (typeof content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });
  try {
    return NextResponse.json(await editComment(postId, commentId, session.uid, content));
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

/** The author deletes their comment, or a moderator removes it; either way its replies keep their place. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ postId: string; commentId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId, commentId } = await params;
  try {
    await deleteComment(postId, commentId, session.uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
