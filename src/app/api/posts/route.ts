import { NextResponse } from "next/server";
import type { PostKind } from "@/lib/communities";
import { createPost } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** Group-agnostic post creation - the Groups home composer's own endpoint, where a group is
 * optional (see createPost's own comment on personal/no-group posts). The per-group composer on a
 * group's own page still posts through /api/groups/[id]/posts - that one's genuinely group-scoped
 * (it also needs group-scoped listPosts right after), this one never assumes a group at all. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // `kind` is passed straight through and re-validated inside createPost against the target
  // community's own enabled modules (a community that doesn't offer Predictions rejects a
  // hand-crafted "prediction" post; a personal post is always forced to "discussion" since there's
  // no community whose vocabulary it could belong to) - so nothing here has to trust it.
  const body = (await request.json().catch(() => ({}))) as { groupId?: string | null; title?: string; content?: string; mediaUrl?: string | null; kind?: PostKind };
  if (typeof body.content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    const post = await createPost(body.groupId ?? null, session.uid, { title: body.title, content: body.content, mediaUrl: body.mediaUrl, kind: body.kind });
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
