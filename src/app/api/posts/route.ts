import { NextResponse } from "next/server";
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

  const body = (await request.json().catch(() => ({}))) as { groupId?: string | null; title?: string; content?: string; mediaUrl?: string | null };
  if (typeof body.content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    const post = await createPost(body.groupId ?? null, session.uid, { title: body.title, content: body.content, mediaUrl: body.mediaUrl });
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
