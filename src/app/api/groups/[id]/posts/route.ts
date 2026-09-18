import { NextResponse } from "next/server";
import { POST_KIND_LABELS, type PostKind } from "@/lib/communities";
import { createPost, listPosts, type PostSort } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

const SORTS: PostSort[] = ["new", "old", "top", "discussed"];

/** An unrecognized `sort=`/`kind=` is treated as "not asked for" rather than as an error: these
 * come from a UI control, and the honest response to a value this deploy doesn't know is the
 * default feed, not a 400 that blanks the page. */
function parseSort(raw: string | null): PostSort | undefined {
  return SORTS.includes(raw as PostSort) ? (raw as PostSort) : undefined;
}

function parseKind(raw: string | null): PostKind | undefined {
  return raw && raw in POST_KIND_LABELS ? (raw as PostKind) : undefined;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { searchParams } = new URL(_request.url);
  try {
    const page = await listPosts(id, session.uid, {
      cursor: searchParams.get("cursor") ?? undefined,
      mediaOnly: searchParams.get("mediaOnly") === "1",
      sort: parseSort(searchParams.get("sort")),
      kind: parseKind(searchParams.get("kind")),
      query: searchParams.get("q") ?? undefined,
      // "Only my posts" is expressed as a flag, not as an author id in the URL - there is no
      // supported way to ask for someone else's posts, so there's nothing to validate or abuse.
      authorId: searchParams.get("mine") === "1" ? session.uid : undefined,
      // Ignored inside listPosts for anyone who can't moderate this community.
      pendingOnly: searchParams.get("pending") === "1",
    });
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  // `kind` is re-validated against the community's own enabled modules AND the poster's real role
  // inside createPost - a kind this community doesn't offer, or an Announcement from an ordinary
  // member, is a 400 there, not something this route has to know about.
  const { title, content, mediaUrl, kind } = (await request.json().catch(() => ({}))) as {
    title?: string;
    content?: string;
    mediaUrl?: string | null;
    kind?: PostKind;
  };
  if (typeof content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    const post = await createPost(id, session.uid, { title, content, mediaUrl, kind });
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
