import { NextResponse } from "next/server";
import { getPostById } from "@/lib/supabase/groupPosts";
import {
  deletePost,
  editPost,
  setPostPinned,
  setPostSubscription,
  votePostPoll,
} from "@/lib/supabase/moderation";
import type { PostSubscriptionState } from "@/lib/communities";
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

/** The author edits their post's title and text, a moderator pins/unpins, a member votes on a poll or toggles thread subscriptions. */
export async function PATCH(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string | null;
    content?: string;
    pinned?: boolean;
    pollOptionId?: string;
    subscription?: PostSubscriptionState;
  };

  try {
    if (typeof body.pinned === "boolean") {
      return NextResponse.json(await setPostPinned(postId, session.uid, body.pinned));
    }
    if (typeof body.pollOptionId === "string") {
      return NextResponse.json(await votePostPoll(postId, session.uid, body.pollOptionId));
    }
    if (typeof body.subscription === "string" && (body.subscription === "default" || body.subscription === "following" || body.subscription === "muted")) {
      return NextResponse.json(await setPostSubscription(postId, session.uid, body.subscription));
    }
    if (typeof body.content === "string") {
      return NextResponse.json(await editPost(postId, session.uid, { title: typeof body.title === "string" ? body.title : null, content: body.content }));
    }
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

/** The author deletes their post; a moderator of its community removes it (and the moderation log records who). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId } = await params;
  try {
    return NextResponse.json(await deletePost(postId, session.uid));
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
