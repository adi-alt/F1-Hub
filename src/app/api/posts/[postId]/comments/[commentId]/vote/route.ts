import { NextResponse } from "next/server";
import { getPostGroupId, setCommentVote } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string; commentId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId, commentId } = await params;
  const { direction } = (await request.json().catch(() => ({}))) as { direction?: 1 | -1 };
  if (direction !== 1 && direction !== -1) return NextResponse.json({ error: "Invalid direction" }, { status: 400 });

  try {
    const groupId = await getPostGroupId(postId);
    const result = await setCommentVote(groupId, commentId, session.uid, direction);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
