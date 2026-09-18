import { NextResponse } from "next/server";
import { getPostById } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/**
 * One post by id - what a shared permalink (`/groups/{id}?post={postId}`) resolves against when the
 * post isn't in the page of the feed the reader happens to have loaded.
 *
 * Membership is enforced inside getPostById, which re-derives the post's own group rather than
 * trusting anything in this request, so a link to a community you're not in is a 403 rather than a
 * leak. A post that doesn't exist and a post you can't see are both 404 - deliberately
 * indistinguishable, so this can't be used to probe which ids are real.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId } = await params;

  try {
    const post = await getPostById(postId, session.uid);
    if (!post) return NextResponse.json({ error: "That post doesn't exist." }, { status: 404 });
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
