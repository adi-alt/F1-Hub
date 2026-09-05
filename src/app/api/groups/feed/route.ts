import { NextResponse } from "next/server";
import { listFeedPosts, type FeedType } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";

const FEED_TYPES: FeedType[] = ["following", "latest", "forYou"];

/** Groups home's own cross-group feed - cursor-paginated (see listFeedPosts), not the per-group
 * listPosts every group detail page already uses. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const rawFeedType = searchParams.get("feedType");
  const feedType = FEED_TYPES.includes(rawFeedType as FeedType) ? (rawFeedType as FeedType) : "following";
  const { posts, nextCursor } = await listFeedPosts(session.uid, { cursor, feedType });
  return NextResponse.json({ posts, nextCursor });
}
