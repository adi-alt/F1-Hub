import { NextResponse } from "next/server";
import type { PostKind, PostPollInput } from "@/lib/communities";
import { createPost, discardNewPost, type PostAttachment } from "@/lib/supabase/groupPosts";
import { saveCall, validateCall } from "@/lib/supabase/postCalls";
import { getCurrentSeason } from "@/lib/currentSeason";
import type { PostCall } from "@/lib/postCalls";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { ServiceError } from "@/services/errors";

/** The one way a post is created, from every composer: the Communities home, a community's own feed and its
 * full-post window. `groupId` names the community (createPost checks membership, permissions and moderation), or is
 * null for a personal post (see createPost's own comment on personal/no-group posts). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "postCreate", session.uid);
  if (limited) return limited;

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
    gallery?: ({ url: string } & Partial<Omit<PostAttachment, "url">>)[] | null;
    poll?: PostPollInput | null;
    kind?: PostKind;
    scheduledAt?: string | null;
    /** A call on this weekend's race (takes with receipts), checked against the race and its lock below. */
    call?: unknown;
  };
  if (typeof body.content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    // A call is checked before the post exists, and only on a post that goes out now: a scheduled post's call would
    // be revealed (or quietly dropped) after the result, which is no call at all.
    let call: PostCall | null = null;
    if (body.call) {
      if (body.scheduledAt) return NextResponse.json({ error: "A post with a call can't be scheduled: it has to be made before the session." }, { status: 400 });
      call = await validateCall(body.call, await getCurrentSeason());
    }

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
      gallery: Array.isArray(body.gallery) ? body.gallery : null,
      poll: body.poll ?? null,
      kind: body.kind,
      scheduledAt: body.scheduledAt,
    });
    if (call) {
      try {
        await saveCall(post.id, session.uid, call);
      } catch (err) {
        console.error("saveCall:", err);
        await discardNewPost(post.id, session.uid);
        return NextResponse.json({ error: "Calls aren't available just yet. Post it without the call, or try again later." }, { status: 503 });
      }
    }
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
