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
  const body = (await request.json().catch(() => ({}))) as {
    groupId?: string | null;
    title?: string;
    content?: string;
    mediaUrl?: string | null;
    attachment?: { name?: string | null; mime?: string | null; size?: number | null; thumbUrl?: string | null; pages?: number | null } | null;
    kind?: PostKind;
    scheduledAt?: string | null;
  };
  if (typeof body.content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    // scheduledAt is validated inside createPost (real date, at least a minute out, at most a year)
    // and is deliberately unable to bypass a community's moderation queue - see its own comment.
    const post = await createPost(body.groupId ?? null, session.uid, {
      title: body.title,
      content: body.content,
      mediaUrl: body.mediaUrl,
      // Metadata only - the URL itself is the server's own, from the upload route. Name is
      // re-sanitised there; size/pages are descriptive and not trusted for any decision.
      attachment: body.attachment
        ? {
            name: typeof body.attachment.name === "string" ? body.attachment.name.slice(0, 200) : null,
            mime: typeof body.attachment.mime === "string" ? body.attachment.mime.slice(0, 120) : null,
            size: typeof body.attachment.size === "number" && body.attachment.size >= 0 ? body.attachment.size : null,
            thumbUrl: typeof body.attachment.thumbUrl === "string" ? body.attachment.thumbUrl : null,
            pages: typeof body.attachment.pages === "number" && body.attachment.pages > 0 ? body.attachment.pages : null,
          }
        : null,
      kind: body.kind,
      scheduledAt: body.scheduledAt,
    });
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
