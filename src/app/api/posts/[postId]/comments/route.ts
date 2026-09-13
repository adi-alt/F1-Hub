import { NextResponse } from "next/server";
import { addComment, getPostGroupId, listComments } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** Group-agnostic - replaces /api/groups/[id]/posts/[postId]/comments, same reasoning as the
 * sibling vote route. */
export async function GET(_request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId } = await params;
  try {
    const groupId = await getPostGroupId(postId);
    const comments = await listComments(groupId, postId, session.uid);
    return NextResponse.json({ comments });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId } = await params;
  const { content, parentCommentId } = (await request.json().catch(() => ({}))) as { content?: string; parentCommentId?: string | null };
  if (typeof content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    const groupId = await getPostGroupId(postId);
    const comment = await addComment(groupId, postId, session.uid, content, parentCommentId);
    return NextResponse.json(comment);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
