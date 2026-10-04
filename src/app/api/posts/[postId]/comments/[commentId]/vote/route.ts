import { NextResponse } from "next/server";
import { getPostGroupId, setCommentVote } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { isUuid } from "@/lib/ids";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string; commentId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "vote", session.uid);
  if (limited) return limited;
  const { postId, commentId } = await params;
  const { direction } = (await request.json().catch(() => ({}))) as { direction?: 1 | -1 };
  if (direction !== 1 && direction !== -1) return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  if (!isUuid(commentId) || !isUuid(postId)) return NextResponse.json({ error: "Comment not found." }, { status: 404 });

  try {
    const groupId = await getPostGroupId(postId);
    const result = await setCommentVote(groupId, postId, commentId, session.uid, direction);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
