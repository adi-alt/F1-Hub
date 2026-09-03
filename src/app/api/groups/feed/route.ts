import { NextResponse } from "next/server";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";

/** Groups home's own cross-group feed - cursor-paginated (see listFeedPosts), not the per-group
 * listPosts every group detail page already uses. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const { posts, nextCursor } = await listFeedPosts(session.uid, cursor);
  return NextResponse.json({ posts, nextCursor });
}
