import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { getMemberRole, requireMember, type GroupRole } from "@/lib/supabase/groups";
import {
  summarizePoll,
  type PostPollView,
  type PostSubscriptionState,
} from "@/lib/communities";
import {
  COMMENT_REACTIONS,
  MAX_COMMENT_CHARS,
  MAX_POST_CHARS,
  MAX_TITLE_CHARS,
  requireCanViewPost,
  summarizeCommentReactions,
  type CommentReactionEmoji,
  type CommentReactionSummary,
} from "@/lib/supabase/groupPosts";
import { displayNames, logModeration } from "@/lib/supabase/moderationLog";
import { ServiceError } from "@/services/errors";

/**
 * Authors editing and deleting what they wrote, readers reporting it, and moderators acting on reports (audit R-42).
 * Everything here goes through the service-role client, so the checks in this file are the enforcement: an author is
 * matched on user_id, a moderator on their real role in the post's own community, never on anything in the request.
 */

const isModerator = (role: GroupRole | null) => role === "admin" || role === "moderator";
const MAX_REASON_CHARS = 500;

type PostRow = { id: string; group_id: string | null; user_id: string; content: string };
type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  deleted_at: string | null;
  parent_comment_id?: string | null;
  reactions?: unknown;
};

async function loadPost(postId: string): Promise<PostRow> {
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("group_posts").select("id, group_id, user_id, content").eq("id", postId).maybeSingle());
  if (error) throw new Error(`loadPost(${postId}): ${error.message}`);
  if (!data) throw new ServiceError("Post not found.", 404);
  return data as PostRow;
}

async function loadComment(postId: string, commentId: string): Promise<CommentRow> {
  let { data, error } = await queryWithRetry(() =>
    supabaseAdmin
      .from("group_post_comments")
      .select("id, post_id, user_id, content, deleted_at, parent_comment_id, reactions")
      .eq("id", commentId)
      .eq("post_id", postId)
      .maybeSingle(),
  );
  if (error && (error.code === "42703" || error.message.includes("reactions"))) {
    const fallback = await queryWithRetry(() =>
      supabaseAdmin
        .from("group_post_comments")
        .select("id, post_id, user_id, content, deleted_at, parent_comment_id")
        .eq("id", commentId)
        .eq("post_id", postId)
        .maybeSingle(),
    );
    data = fallback.data as typeof data;
    error = fallback.error;
  }
  if (error) throw new Error(`loadComment(${commentId}): ${error.message}`);
  if (!data || data.deleted_at) throw new ServiceError("Comment not found.", 404);
  return data as CommentRow;
}

/** The viewer's role in the post's community; null for a personal post. Throws 403 for a non-member. */
async function roleFor(post: PostRow, uid: string): Promise<GroupRole | null> {
  return post.group_id ? requireMember(post.group_id, uid) : null;
}

export async function editPost(postId: string, uid: string, input: { title?: string | null; content: string }): Promise<{ editedAt: string }> {
  const post = await loadPost(postId);
  if (post.user_id !== uid) throw new ServiceError("Only the author can edit a post.", 403);
  await roleFor(post, uid);
  const content = input.content.trim();
  if (!content) throw new ServiceError("Write something first.", 400);
  if (content.length > MAX_POST_CHARS) throw new ServiceError(`Posts are limited to ${MAX_POST_CHARS} characters.`, 400);
  const title = input.title?.trim() || null;
  if (title && title.length > MAX_TITLE_CHARS) throw new ServiceError(`Titles are limited to ${MAX_TITLE_CHARS} characters.`, 400);
  const editedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from("group_posts").update({ title, content, edited_at: editedAt }).eq("id", postId).eq("user_id", uid);
  if (error) throw new Error(`editPost(${postId}): ${error.message}`);
  return { editedAt };
}

/** An author deletes their post outright; a moderator removes someone else's (it leaves the feed, and the log says who). */
export async function deletePost(postId: string, uid: string): Promise<{ removed: "deleted" | "moderated" }> {
  const post = await loadPost(postId);
  if (post.user_id === uid) {
    await roleFor(post, uid);
    const { error } = await supabaseAdmin.from("group_posts").delete().eq("id", postId).eq("user_id", uid);
    if (error) throw new Error(`deletePost(${postId}): ${error.message}`);
    return { removed: "deleted" };
  }
  const role = await roleFor(post, uid);
  if (!post.group_id || !isModerator(role)) throw new ServiceError("Only the author or a moderator can delete a post.", 403);
  const { error } = await supabaseAdmin.from("group_posts").update({ status: "rejected" }).eq("id", postId).eq("group_id", post.group_id);
  if (error) throw new Error(`deletePost(${postId}): ${error.message}`);
  await logModeration({ groupId: post.group_id, actorId: uid, action: "post_removed", postId, targetUserId: post.user_id, excerpt: post.content });
  return { removed: "moderated" };
}

/** Only community moderators can close or reopen a discussion. A lock is enforced by addComment,
 * so a handcrafted request cannot bypass the UI state. */
export async function setCommentsLocked(postId: string, uid: string, locked: boolean): Promise<void> {
  const post = await loadPost(postId);
  if (!post.group_id) throw new ServiceError("Only community posts can lock comments.", 400);
  const role = await roleFor(post, uid);
  if (!isModerator(role)) throw new ServiceError("Only a moderator can lock comments.", 403);
  const { error } = await supabaseAdmin.from("group_posts").update({ comments_locked_at: locked ? new Date().toISOString() : null }).eq("id", postId).eq("group_id", post.group_id);
  if (error) throw new Error(`setCommentsLocked(${postId}): ${error.message}`);
}

/** Pins or unpins a post in its community (community moderator only). Caps at 3 pinned posts per community. */
export async function setPostPinned(postId: string, uid: string, pinned: boolean): Promise<{ pinned: boolean }> {
  const post = await loadPost(postId);
  if (!post.group_id) throw new ServiceError("Only community posts can be pinned.", 400);
  const role = await roleFor(post, uid);
  if (!isModerator(role)) throw new ServiceError("Only a moderator can pin a post.", 403);

  if (pinned) {
    const { data: currentPinned } = await supabaseAdmin
      .from("group_posts")
      .select("id")
      .eq("group_id", post.group_id)
      .not("pinned_at", "is", null)
      .order("pinned_at", { ascending: true });
    const existing = (currentPinned ?? []).filter((p) => p.id !== postId);
    if (existing.length >= 3) {
      const toUnpin = existing.slice(0, existing.length - 2).map((p) => p.id as string);
      if (toUnpin.length > 0) {
        await supabaseAdmin.from("group_posts").update({ pinned_at: null }).in("id", toUnpin);
      }
    }
  }

  const { error } = await supabaseAdmin
    .from("group_posts")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", postId)
    .eq("group_id", post.group_id);
  if (error) throw new Error(`setPostPinned(${postId}): ${error.message}`);
  return { pinned };
}

/** Toggles or casts a vote on an interactive post poll. */
export async function votePostPoll(postId: string, uid: string, optionId: string): Promise<{ poll: PostPollView }> {
  const post = await loadPost(postId);
  await requireCanViewPost(post.group_id, uid);
  const { data: row, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_posts").select("poll").eq("id", postId).maybeSingle(),
  );
  if (error) throw new Error(`votePostPoll(${postId}): ${error.message}`);
  if (!row?.poll || typeof row.poll !== "object" || Array.isArray(row.poll)) {
    throw new ServiceError("This post does not have a poll.", 404);
  }
  const poll = row.poll as {
    question?: string | null;
    options: { id: string; label: string }[];
    votes?: Record<string, string>;
    closesAt?: string | null;
  };
  const validOption = Array.isArray(poll.options) && poll.options.some((o) => o.id === optionId);
  if (!validOption) throw new ServiceError("Invalid poll option.", 400);

  if (poll.closesAt && Date.parse(poll.closesAt) <= Date.now()) {
    throw new ServiceError("This poll is closed.", 400);
  }

  const currentVotes =
    poll.votes && typeof poll.votes === "object" && !Array.isArray(poll.votes)
      ? { ...(poll.votes as Record<string, string>) }
      : {};

  if (currentVotes[uid] === optionId) {
    delete currentVotes[uid];
  } else {
    currentVotes[uid] = optionId;
  }

  const nextPoll = { ...poll, votes: currentVotes };
  const { error: updateError } = await supabaseAdmin.from("group_posts").update({ poll: nextPoll }).eq("id", postId);
  if (updateError) throw new Error(`votePostPoll(${postId}): ${updateError.message}`);

  const summarized = summarizePoll(nextPoll, uid);
  if (!summarized) throw new ServiceError("Could not summarize poll.", 500);
  return { poll: summarized };
}

/** Sets a user's notification subscription for a post ("default" | "following" | "muted"). */
export async function setPostSubscription(
  postId: string,
  uid: string,
  state: PostSubscriptionState,
): Promise<{ subscription: PostSubscriptionState }> {
  const post = await loadPost(postId);
  await requireCanViewPost(post.group_id, uid);
  const { data: row, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_posts").select("subscriptions").eq("id", postId).maybeSingle(),
  );
  if (error) throw new Error(`setPostSubscription(${postId}): ${error.message}`);
  const raw =
    row?.subscriptions && typeof row.subscriptions === "object" && !Array.isArray(row.subscriptions)
      ? (row.subscriptions as Record<string, unknown>)
      : {};
  let following = Array.isArray(raw.following) ? raw.following.filter((id): id is string => typeof id === "string") : [];
  let muted = Array.isArray(raw.muted) ? raw.muted.filter((id): id is string => typeof id === "string") : [];
  following = following.filter((id) => id !== uid);
  muted = muted.filter((id) => id !== uid);
  if (state === "following") following.push(uid);
  if (state === "muted") muted.push(uid);

  const nextSubs = { following, muted };
  const { error: updateError } = await supabaseAdmin.from("group_posts").update({ subscriptions: nextSubs }).eq("id", postId);
  if (updateError) throw new Error(`setPostSubscription(${postId}): ${updateError.message}`);
  return { subscription: state };
}

export async function editComment(postId: string, commentId: string, uid: string, content: string): Promise<{ editedAt: string }> {
  const post = await loadPost(postId);
  await roleFor(post, uid);
  const comment = await loadComment(postId, commentId);
  if (comment.user_id !== uid) throw new ServiceError("Only the author can edit a comment.", 403);
  const trimmed = content.trim();
  if (!trimmed) throw new ServiceError("Write a comment first.", 400);
  if (trimmed.length > MAX_COMMENT_CHARS) throw new ServiceError(`Comments are limited to ${MAX_COMMENT_CHARS} characters.`, 400);
  const editedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from("group_post_comments").update({ content: trimmed, edited_at: editedAt }).eq("id", commentId).eq("user_id", uid);
  if (error) throw new Error(`editComment(${commentId}): ${error.message}`);
  return { editedAt };
}

/** Pins or unpins a top-level comment on a post (post author or community moderator). */
export async function setCommentPinned(postId: string, commentId: string, uid: string, pinned: boolean): Promise<{ pinned: boolean }> {
  const post = await loadPost(postId);
  const role = await roleFor(post, uid);
  if (post.user_id !== uid && !(post.group_id && isModerator(role))) {
    throw new ServiceError("Only the post author or a moderator can pin a comment.", 403);
  }
  const comment = await loadComment(postId, commentId);
  if (comment.parent_comment_id) throw new ServiceError("Only top-level comments can be pinned.", 400);
  if (pinned) {
    await supabaseAdmin.from("group_post_comments").update({ pinned_at: null }).eq("post_id", postId);
  }
  const { error } = await supabaseAdmin
    .from("group_post_comments")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", commentId)
    .eq("post_id", postId);
  if (error) throw new Error(`setCommentPinned(${commentId}): ${error.message}`);
  return { pinned };
}

/** Marks or unmarks a top-level comment as the accepted answer on a question post (post author or community moderator). */
export async function setCommentAccepted(postId: string, commentId: string, uid: string, accepted: boolean): Promise<{ accepted: boolean }> {
  const post = await loadPost(postId);
  const role = await roleFor(post, uid);
  if (post.user_id !== uid && !(post.group_id && isModerator(role))) {
    throw new ServiceError("Only the post author or a moderator can mark an answer.", 403);
  }
  const comment = await loadComment(postId, commentId);
  if (comment.parent_comment_id) throw new ServiceError("Only top-level comments can be marked as the answer.", 400);
  if (accepted) {
    await supabaseAdmin.from("group_post_comments").update({ accepted_at: null }).eq("post_id", postId);
  }
  const { error } = await supabaseAdmin
    .from("group_post_comments")
    .update({ accepted_at: accepted ? new Date().toISOString() : null })
    .eq("id", commentId)
    .eq("post_id", postId);
  if (error) throw new Error(`setCommentAccepted(${commentId}): ${error.message}`);
  return { accepted };
}

/** Toggles an emoji reaction (`🔥`, `🏁`, `💯`, `😂`, `👍`) on a comment. */
export async function toggleCommentReaction(
  postId: string,
  commentId: string,
  uid: string,
  emoji: string,
): Promise<{ reactions: CommentReactionSummary[] }> {
  if (!COMMENT_REACTIONS.includes(emoji as CommentReactionEmoji)) {
    throw new ServiceError("Invalid reaction emoji.", 400);
  }
  const post = await loadPost(postId);
  await roleFor(post, uid);
  const comment = await loadComment(postId, commentId);
  const raw =
    comment.reactions && typeof comment.reactions === "object" && !Array.isArray(comment.reactions)
      ? (comment.reactions as Record<string, unknown>)
      : {};
  const existing = Array.isArray(raw[emoji])
    ? (raw[emoji] as unknown[]).filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const unique = [...new Set(existing)];
  const updated = unique.includes(uid) ? unique.filter((id) => id !== uid) : [...unique, uid];
  const nextReactions: Record<string, string[]> = {};
  for (const key of COMMENT_REACTIONS) {
    if (key === emoji) {
      if (updated.length > 0) nextReactions[key] = updated;
    } else if (Array.isArray(raw[key])) {
      const list = [...new Set((raw[key] as unknown[]).filter((item): item is string => typeof item === "string" && item.length > 0))];
      if (list.length > 0) nextReactions[key] = list;
    }
  }
  const { error } = await supabaseAdmin
    .from("group_post_comments")
    .update({ reactions: nextReactions })
    .eq("id", commentId)
    .eq("post_id", postId);
  if (error) throw new Error(`toggleCommentReaction(${commentId}): ${error.message}`);
  return { reactions: summarizeCommentReactions(nextReactions, uid) };
}

/** A tombstone rather than a delete, so replies keep their thread: the text goes, the place stays. */
export async function deleteComment(postId: string, commentId: string, uid: string): Promise<void> {
  const post = await loadPost(postId);
  const role = await roleFor(post, uid);
  const comment = await loadComment(postId, commentId);
  const mine = comment.user_id === uid;
  if (!mine && !(post.group_id && isModerator(role))) throw new ServiceError("Only the author or a moderator can delete a comment.", 403);
  await tombstone(commentId);
  if (!mine && post.group_id) {
    await logModeration({ groupId: post.group_id, actorId: uid, action: "comment_removed", postId, commentId, targetUserId: comment.user_id, excerpt: comment.content });
  }
}

async function tombstone(commentId: string) {
  const { error } = await supabaseAdmin.from("group_post_comments").update({ content: "[deleted]", deleted_at: new Date().toISOString() }).eq("id", commentId);
  if (error) throw new Error(`deleteComment(${commentId}): ${error.message}`);
}

/** Anyone who can see a community post can report it, or one of its comments. Reporting the same thing twice is a no-op. */
export async function reportContent(postId: string, uid: string, input: { commentId?: string | null; reason: string }): Promise<void> {
  const post = await loadPost(postId);
  if (!post.group_id) throw new ServiceError("Only posts in a community can be reported.", 400);
  await requireMember(post.group_id, uid);
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("Say what's wrong with it.", 400);
  if (reason.length > MAX_REASON_CHARS) throw new ServiceError(`Reports are limited to ${MAX_REASON_CHARS} characters.`, 400);
  const target = input.commentId ? await loadComment(postId, input.commentId) : post;
  if (target.user_id === uid) throw new ServiceError("You can't report your own post.", 400);
  const { error } = await supabaseAdmin
    .from("group_post_reports")
    .insert({ group_id: post.group_id, post_id: postId, comment_id: input.commentId ?? null, reporter_id: uid, reason });
  // 23505: already reported by this person - the report stands, nothing to add.
  if (error && error.code !== "23505") throw new Error(`reportContent(${postId}): ${error.message}`);
}

export type OpenReport = {
  id: string;
  postId: string;
  commentId: string | null;
  /** What was reported, as it reads now. */
  excerpt: string;
  authorId: string;
  authorName: string;
  reporterName: string;
  reason: string;
  createdAt: string;
};

export async function requireModerator(groupId: string, uid: string) {
  const role = await getMemberRole(groupId, uid);
  if (!isModerator(role)) throw new ServiceError("Only a group admin or moderator can do that.", 403);
}

/** The open report queue for one community, oldest first (the longest wait gets seen first). */
export async function listOpenReports(groupId: string, uid: string): Promise<OpenReport[]> {
  await requireModerator(groupId, uid);
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_post_reports").select("*").eq("group_id", groupId).eq("status", "open").order("created_at").limit(100),
  );
  if (error) throw new Error(`listOpenReports(${groupId}): ${error.message}`);
  const reports = data ?? [];
  if (reports.length === 0) return [];
  const postIds = [...new Set(reports.map((r) => r.post_id as string))];
  const commentIds = [...new Set(reports.map((r) => r.comment_id as string | null).filter((id): id is string => !!id))];
  const [{ data: posts, error: postsError }, { data: comments, error: commentsError }] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_posts").select("id, user_id, content").in("id", postIds)),
    commentIds.length
      ? queryWithRetry(() => supabaseAdmin.from("group_post_comments").select("id, user_id, content").in("id", commentIds))
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  if (postsError || commentsError) throw new Error(`listOpenReports(${groupId}): ${(postsError ?? commentsError)?.message}`);
  const byId = new Map([...(posts ?? []), ...(comments ?? [])].map((row) => [row.id as string, row as { user_id: string; content: string }]));
  const names = await displayNames([...new Set([...reports.map((r) => r.reporter_id as string), ...[...byId.values()].map((row) => row.user_id)])]);
  return reports.flatMap((r) => {
    const target = byId.get((r.comment_id as string | null) ?? (r.post_id as string));
    if (!target) return [];
    return [
      {
        id: r.id as string,
        postId: r.post_id as string,
        commentId: (r.comment_id as string | null) ?? null,
        excerpt: target.content.slice(0, 280),
        authorId: target.user_id,
        authorName: names.get(target.user_id) ?? "Member",
        reporterName: names.get(r.reporter_id as string) ?? "Member",
        reason: r.reason as string,
        createdAt: r.created_at as string,
      },
    ];
  });
}

/** Dismisses a report, or removes what it's about (and closes every open report on that same thing). */
export async function resolveReport(groupId: string, reportId: string, uid: string, action: "dismiss" | "remove"): Promise<void> {
  await requireModerator(groupId, uid);
  const { data: report, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_post_reports").select("*").eq("id", reportId).eq("group_id", groupId).maybeSingle(),
  );
  if (error) throw new Error(`resolveReport(${reportId}): ${error.message}`);
  if (!report || report.status !== "open") throw new ServiceError("That report has already been dealt with.", 409);
  const postId = report.post_id as string;
  const commentId = (report.comment_id as string | null) ?? null;
  const resolved = { resolved_by: uid, resolved_at: new Date().toISOString() };

  if (action === "dismiss") {
    const { error: updateError } = await supabaseAdmin.from("group_post_reports").update({ status: "dismissed", ...resolved }).eq("id", reportId);
    if (updateError) throw new Error(`resolveReport(${reportId}): ${updateError.message}`);
    await logModeration({ groupId, actorId: uid, action: "report_dismissed", postId, commentId, reportId });
    return;
  }

  if (commentId) {
    const comment = await loadComment(postId, commentId);
    await tombstone(commentId);
    await logModeration({ groupId, actorId: uid, action: "comment_removed", postId, commentId, reportId, targetUserId: comment.user_id, excerpt: comment.content });
  } else {
    const post = await loadPost(postId);
    const { error: removeError } = await supabaseAdmin.from("group_posts").update({ status: "rejected" }).eq("id", postId).eq("group_id", groupId);
    if (removeError) throw new Error(`resolveReport(${reportId}): ${removeError.message}`);
    await logModeration({ groupId, actorId: uid, action: "post_removed", postId, reportId, targetUserId: post.user_id, excerpt: post.content });
  }
  let close = supabaseAdmin.from("group_post_reports").update({ status: "actioned", ...resolved }).eq("group_id", groupId).eq("post_id", postId).eq("status", "open");
  close = commentId ? close.eq("comment_id", commentId) : close.is("comment_id", null);
  const { error: closeError } = await close;
  if (closeError) throw new Error(`resolveReport(${reportId}): ${closeError.message}`);
}
