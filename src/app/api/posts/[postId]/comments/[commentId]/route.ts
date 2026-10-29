import { NextResponse } from "next/server";
import { deleteComment, editComment, setCommentAccepted, setCommentPinned, toggleCommentReaction } from "@/lib/supabase/moderation";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** The author edits their comment, the post author/moderator pins or accepts a comment, or a member toggles a reaction. */
export async function PATCH(request: Request, { params }: { params: Promise<{ postId: string; commentId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId, commentId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    pinned?: boolean;
    accepted?: boolean;
    reaction?: string;
  };
  try {
    if (typeof body.pinned === "boolean") {
      return NextResponse.json(await setCommentPinned(postId, commentId, session.uid, body.pinned));
    }
    if (typeof body.accepted === "boolean") {
      return NextResponse.json(await setCommentAccepted(postId, commentId, session.uid, body.accepted));
    }
    if (typeof body.reaction === "string") {
      return NextResponse.json(await toggleCommentReaction(postId, commentId, session.uid, body.reaction));
    }
    if (typeof body.content === "string") {
      return NextResponse.json(await editComment(postId, commentId, session.uid, body.content));
    }
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
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
