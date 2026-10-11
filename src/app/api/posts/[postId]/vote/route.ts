import { NextResponse } from "next/server";
import { getPostGroupId, setVote } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { ServiceError } from "@/services/errors";

/** Group-agnostic - PostVoteControl calls this the same way whether the post is in a group or
 * personal (see getPostGroupId). Replaces the old /api/groups/[id]/posts/[postId]/vote, which
 * needed a group id in the URL a personal post doesn't have. */
export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "vote", session.uid);
  if (limited) return limited;
  const { postId } = await params;
  const { direction } = (await request.json().catch(() => ({}))) as { direction?: 1 | -1 };
  if (direction !== 1 && direction !== -1) return NextResponse.json({ error: "Invalid direction" }, { status: 400 });

  try {
    const groupId = await getPostGroupId(postId);
    const result = await setVote(groupId, postId, session.uid, direction);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
