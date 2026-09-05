import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { requireMember, type GroupRole } from "@/lib/supabase/groups";
import { ServiceError } from "@/services/errors";

export type PostStatus = "published" | "pending" | "rejected";
export type VoteValue = 1 | -1 | 0;
export type FeedType = "following" | "latest" | "forYou";

export type GroupPost = {
  id: string;
  groupId: string;
  userId: string;
  authorName: string;
  authorRole: GroupRole;
  title: string | null;
  content: string;
  mediaUrl: string | null;
  status: PostStatus;
  createdAt: string;
  score: number;
  myVote: VoteValue;
  commentCount: number;
};

export type PostComment = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  userId: string;
  authorName: string;
  content: string;
  createdAt: string;
  score: number;
  myVote: VoteValue;
};

export type FeedPost = {
  id: string;
  groupId: string | null;
  groupName: string | null;
  groupAvatarUrl: string | null;
  userId: string;
  authorName: string;
  title: string | null;
  content: string;
  mediaUrl: string | null;
  createdAt: string;
  score: number;
  myVote: VoteValue;
  commentCount: number;
};

const MAX_POST_CHARS = 2000;
const MAX_TITLE_CHARS = 300;
const MAX_COMMENT_CHARS = 1000;

type ProfileLite = { id: string; display_name: string | null; username: string | null };
async function profilesById(userIds: string[]): Promise<Map<string, ProfileLite>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("profiles").select("id, display_name, username").in("id", userIds));
  if (error) throw new Error(`profilesById: ${error.message}`);
  return new Map((data ?? []).map((p) => [p.id as string, p as ProfileLite]));
}
function nameFor(profile: ProfileLite | undefined, userId: string): string {
  return profile?.display_name ?? profile?.username ?? `User ${userId.slice(0, 6)}`;
}

/** group_id null means a personal/global post - no group to enforce membership against, so this
 * is a no-op in that case. Every other call in this file that touches a specific group_id routes
 * through this instead of calling requireMember directly, so "personal posts skip group checks
 * entirely" stays true in exactly one place. */
async function requireMemberIfGrouped(groupId: string | null, uid: string): Promise<GroupRole | null> {
  if (groupId === null) return null;
  return requireMember(groupId, uid);
}

/** A published post whose content later turns out unwelcome can still be pulled by a moderator
 * (see moderatePost) - `rejected` doubles as both "never approved" and "removed after the fact".
 * groupId null - a personal post, never moderated (there's no group whose admin/moderator it would
 * even be), always published immediately. */
export async function createPost(
  groupId: string | null,
  uid: string,
  input: { title?: string; content: string; mediaUrl?: string | null },
): Promise<{ id: string; status: PostStatus }> {
  const trimmedContent = input.content.trim();
  if (!trimmedContent) throw new ServiceError("Write something first.", 400);
  if (trimmedContent.length > MAX_POST_CHARS) throw new ServiceError(`Posts are limited to ${MAX_POST_CHARS} characters.`, 400);
  const trimmedTitle = input.title?.trim() || null;
  if (trimmedTitle && trimmedTitle.length > MAX_TITLE_CHARS) throw new ServiceError(`Titles are limited to ${MAX_TITLE_CHARS} characters.`, 400);

  let status: PostStatus = "published";
  if (groupId !== null) {
    const role = await requireMember(groupId, uid);
    const { data: group, error: groupError } = await supabaseAdmin.from("groups").select("moderation_enabled").eq("id", groupId).maybeSingle();
    if (groupError) throw new Error(`createPost(${groupId}): ${groupError.message}`);
    // Admins/moderators bypass their own group's queue - a standard forum convention (the people
    // trusted to approve everyone else's posts don't need their own approved).
    const needsApproval = !!group?.moderation_enabled && role === "member";
    status = needsApproval ? "pending" : "published";
  }

  const { data, error } = await supabaseAdmin
    .from("group_posts")
    .insert({ group_id: groupId, user_id: uid, title: trimmedTitle, content: trimmedContent, media_url: input.mediaUrl ?? null, status })
    .select("id")
    .single();
  if (error || !data) throw error ?? new ServiceError("Could not create post.", 500);
  return { id: data.id as string, status };
}

/** Everyone sees published posts; a post's own author also sees it while pending/rejected; an
 * admin/moderator additionally sees every pending post from anyone (the moderation queue). */
export async function listPosts(groupId: string, uid: string): Promise<GroupPost[]> {
  const role = await requireMember(groupId, uid);
  const canModerate = role === "admin" || role === "moderator";

  const visibilityFilter = canModerate ? `status.eq.published,status.eq.pending,user_id.eq.${uid}` : `status.eq.published,user_id.eq.${uid}`;
  const { data: posts, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_posts").select("*").eq("group_id", groupId).or(visibilityFilter).order("created_at", { ascending: false }),
  );
  if (error) throw new Error(`listPosts(${groupId}): ${error.message}`);
  if (!posts?.length) return [];

  const postIds = posts.map((p) => p.id as string);
  const authorIds = [...new Set(posts.map((p) => p.user_id as string))];
  const [{ data: votes, error: votesError }, { data: comments, error: commentsError }, { data: members, error: membersError }, profileById] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_post_votes").select("post_id, user_id, value").in("post_id", postIds)),
    queryWithRetry(() => supabaseAdmin.from("group_post_comments").select("post_id").in("post_id", postIds)),
    queryWithRetry(() => supabaseAdmin.from("group_members").select("user_id, role").eq("group_id", groupId).in("user_id", authorIds)),
    profilesById(authorIds),
  ]);
  if (votesError) throw new Error(`listPosts(${groupId}): ${votesError.message}`);
  if (commentsError) throw new Error(`listPosts(${groupId}): ${commentsError.message}`);
  if (membersError) throw new Error(`listPosts(${groupId}): ${membersError.message}`);

  const roleByAuthor = new Map((members ?? []).map((m) => [m.user_id as string, m.role as GroupRole]));
  const { scoreByTarget, myVoteByTarget } = tallyVotes(votes, uid);
  const commentCounts = new Map<string, number>();
  for (const c of comments ?? []) commentCounts.set(c.post_id as string, (commentCounts.get(c.post_id as string) ?? 0) + 1);

  return posts.map((p) => ({
    id: p.id as string,
    groupId: p.group_id as string,
    userId: p.user_id as string,
    authorName: nameFor(profileById.get(p.user_id as string), p.user_id as string),
    authorRole: roleByAuthor.get(p.user_id as string) ?? "member",
    title: (p.title as string | null) ?? null,
    content: p.content as string,
    mediaUrl: (p.media_url as string | null) ?? null,
    status: p.status as PostStatus,
    createdAt: p.created_at as string,
    score: scoreByTarget.get(p.id as string) ?? 0,
    myVote: myVoteByTarget.get(p.id as string) ?? 0,
    commentCount: commentCounts.get(p.id as string) ?? 0,
  }));
}

// Shared by post votes and comment votes - same {target_id, user_id, value} shape either way.
function tallyVotes(rows: { post_id?: string; comment_id?: string; user_id: string; value: number }[] | null, uid: string) {
  const scoreByTarget = new Map<string, number>();
  const myVoteByTarget = new Map<string, VoteValue>();
  for (const v of rows ?? []) {
    const target = (v.post_id ?? v.comment_id) as string;
    scoreByTarget.set(target, (scoreByTarget.get(target) ?? 0) + v.value);
    if (v.user_id === uid) myVoteByTarget.set(target, v.value as VoteValue);
  }
  return { scoreByTarget, myVoteByTarget };
}

/** The Groups home feed - cursor-paginated on created_at.
 * - "following": every group the user has actually joined (private or public) - the original,
 *   most personal view.
 * - "latest": every public group plus every personal (no-group) post, regardless of membership -
 *   a real "what's happening platform-wide" view, not a fake ranking.
 * - "forYou": following's groups unioned with latest's public groups + personal posts - broader
 *   than following, still grounded in your real memberships rather than a black-box algorithm.
 * No engagement-based ranking in any of the three - all three are plain chronological, since
 * there's no real signal yet (a handful of groups, most with a handful of posts) to rank
 * meaningfully on. */
export async function listFeedPosts(uid: string, opts: { cursor?: string; limit?: number; feedType?: FeedType } = {}): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const feedType = opts.feedType ?? "following";
  const limit = opts.limit ?? 15;

  const { data: memberships, error: membershipsError } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid));
  if (membershipsError) throw new Error(`listFeedPosts: ${membershipsError.message}`);
  const joinedGroupIds = [...new Set((memberships ?? []).map((m) => m.group_id as string))];

  let query = supabaseAdmin.from("group_posts").select("*").eq("status", "published").order("created_at", { ascending: false }).limit(limit + 1);

  if (feedType === "following") {
    if (joinedGroupIds.length === 0) return { posts: [], nextCursor: null };
    query = query.in("group_id", joinedGroupIds);
  } else {
    const { data: publicGroups, error: publicError } = await queryWithRetry(() => supabaseAdmin.from("groups").select("id").eq("visibility", "public"));
    if (publicError) throw new Error(`listFeedPosts: ${publicError.message}`);
    const idSet = new Set((publicGroups ?? []).map((g) => g.id as string));
    if (feedType === "forYou") for (const id of joinedGroupIds) idSet.add(id);
    const ids = [...idSet];
    query = ids.length > 0 ? query.or(`group_id.in.(${ids.join(",")}),group_id.is.null`) : query.is("group_id", null);
  }
  if (opts.cursor) query = query.lt("created_at", opts.cursor);

  const { data: rows, error } = await queryWithRetry(() => query);
  if (error) throw new Error(`listFeedPosts: ${error.message}`);
  if (!rows?.length) return { posts: [], nextCursor: null };

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const postIds = page.map((p) => p.id as string);
  const authorIds = [...new Set(page.map((p) => p.user_id as string))];
  const postGroupIds = [...new Set(page.map((p) => p.group_id as string).filter((id): id is string => !!id))];

  const [{ data: votes, error: votesError }, { data: comments, error: commentsError }, { data: groupsData, error: groupsError }, profileById] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_post_votes").select("post_id, user_id, value").in("post_id", postIds)),
    queryWithRetry(() => supabaseAdmin.from("group_post_comments").select("post_id").in("post_id", postIds)),
    postGroupIds.length > 0 ? queryWithRetry(() => supabaseAdmin.from("groups").select("id, name, avatar_url").in("id", postGroupIds)) : Promise.resolve({ data: [], error: null }),
    profilesById(authorIds),
  ]);
  if (votesError) throw new Error(`listFeedPosts: ${votesError.message}`);
  if (commentsError) throw new Error(`listFeedPosts: ${commentsError.message}`);
  if (groupsError) throw new Error(`listFeedPosts: ${groupsError.message}`);

  const groupById = new Map((groupsData ?? []).map((g) => [g.id as string, g]));
  const { scoreByTarget, myVoteByTarget } = tallyVotes(votes, uid);
  const commentCounts = new Map<string, number>();
  for (const c of comments ?? []) commentCounts.set(c.post_id as string, (commentCounts.get(c.post_id as string) ?? 0) + 1);

  const posts: FeedPost[] = page.map((p) => {
    const groupId = (p.group_id as string | null) ?? null;
    const group = groupId ? groupById.get(groupId) : undefined;
    return {
      id: p.id as string,
      groupId,
      groupName: (group?.name as string | undefined) ?? null,
      groupAvatarUrl: (group?.avatar_url as string | null | undefined) ?? null,
      userId: p.user_id as string,
      authorName: nameFor(profileById.get(p.user_id as string), p.user_id as string),
      title: (p.title as string | null) ?? null,
      content: p.content as string,
      mediaUrl: (p.media_url as string | null) ?? null,
      createdAt: p.created_at as string,
      score: scoreByTarget.get(p.id as string) ?? 0,
      myVote: myVoteByTarget.get(p.id as string) ?? 0,
      commentCount: commentCounts.get(p.id as string) ?? 0,
    };
  });
  return { posts, nextCursor: hasMore ? (page[page.length - 1].created_at as string) : null };
}

/** Sets (or clears) the current user's vote - clicking the already-active direction again clears
 * it, clicking the other direction switches straight over (never two rows, the primary key on
 * (post_id, user_id) makes that structurally impossible anyway). groupId null skips the group-
 * membership gate (see requireMemberIfGrouped). */
export async function setVote(groupId: string | null, postId: string, uid: string, direction: 1 | -1): Promise<{ myVote: VoteValue }> {
  await requireMemberIfGrouped(groupId, uid);
  const { data: existing, error: existingError } = await supabaseAdmin.from("group_post_votes").select("value").eq("post_id", postId).eq("user_id", uid).maybeSingle();
  if (existingError) throw new Error(`setVote(${postId}): ${existingError.message}`);

  if (existing?.value === direction) {
    const { error } = await supabaseAdmin.from("group_post_votes").delete().eq("post_id", postId).eq("user_id", uid);
    if (error) throw new Error(`setVote(${postId}): ${error.message}`);
    return { myVote: 0 };
  }
  const { error } = await supabaseAdmin.from("group_post_votes").upsert({ post_id: postId, user_id: uid, value: direction });
  if (error) throw new Error(`setVote(${postId}): ${error.message}`);
  return { myVote: direction };
}

export async function setCommentVote(groupId: string | null, commentId: string, uid: string, direction: 1 | -1): Promise<{ myVote: VoteValue }> {
  await requireMemberIfGrouped(groupId, uid);
  const { data: existing, error: existingError } = await supabaseAdmin.from("group_comment_votes").select("value").eq("comment_id", commentId).eq("user_id", uid).maybeSingle();
  if (existingError) throw new Error(`setCommentVote(${commentId}): ${existingError.message}`);

  if (existing?.value === direction) {
    const { error } = await supabaseAdmin.from("group_comment_votes").delete().eq("comment_id", commentId).eq("user_id", uid);
    if (error) throw new Error(`setCommentVote(${commentId}): ${error.message}`);
    return { myVote: 0 };
  }
  const { error } = await supabaseAdmin.from("group_comment_votes").upsert({ comment_id: commentId, user_id: uid, value: direction });
  if (error) throw new Error(`setCommentVote(${commentId}): ${error.message}`);
  return { myVote: direction };
}

/** Flat, not a recursive SQL query - the client builds the tree from parentCommentId (a handful of
 * comments per post at most, cheap to nest in JS; a recursive CTE would be real complexity for no
 * real benefit at this scale). */
export async function listComments(groupId: string | null, postId: string, uid: string): Promise<PostComment[]> {
  await requireMemberIfGrouped(groupId, uid);
  const { data: comments, error } = await queryWithRetry(() => supabaseAdmin.from("group_post_comments").select("*").eq("post_id", postId).order("created_at"));
  if (error) throw new Error(`listComments(${postId}): ${error.message}`);
  if (!comments?.length) return [];

  const commentIds = comments.map((c) => c.id as string);
  const [profileById, { data: votes, error: votesError }] = await Promise.all([
    profilesById([...new Set(comments.map((c) => c.user_id as string))]),
    queryWithRetry(() => supabaseAdmin.from("group_comment_votes").select("comment_id, user_id, value").in("comment_id", commentIds)),
  ]);
  if (votesError) throw new Error(`listComments(${postId}): ${votesError.message}`);
  const { scoreByTarget, myVoteByTarget } = tallyVotes(votes, uid);

  return comments.map((c) => ({
    id: c.id as string,
    postId: c.post_id as string,
    parentCommentId: (c.parent_comment_id as string | null) ?? null,
    userId: c.user_id as string,
    authorName: nameFor(profileById.get(c.user_id as string), c.user_id as string),
    content: c.content as string,
    createdAt: c.created_at as string,
    score: scoreByTarget.get(c.id as string) ?? 0,
    myVote: myVoteByTarget.get(c.id as string) ?? 0,
  }));
}

export async function addComment(groupId: string | null, postId: string, uid: string, content: string, parentCommentId?: string | null): Promise<{ id: string }> {
  await requireMemberIfGrouped(groupId, uid);
  const trimmed = content.trim();
  if (!trimmed) throw new ServiceError("Write a comment first.", 400);
  if (trimmed.length > MAX_COMMENT_CHARS) throw new ServiceError(`Comments are limited to ${MAX_COMMENT_CHARS} characters.`, 400);

  const { data, error } = await supabaseAdmin
    .from("group_post_comments")
    .insert({ post_id: postId, user_id: uid, content: trimmed, parent_comment_id: parentCommentId ?? null })
    .select("id")
    .single();
  if (error || !data) throw error ?? new ServiceError("Could not add comment.", 500);
  return { id: data.id as string };
}

/** The one lookup every group-agnostic post/comment route needs first - "which group (if any) does
 * this post belong to", so the real membership gate (requireMemberIfGrouped) can still apply
 * without the route itself needing to know or care whether this is a group or personal post. */
export async function getPostGroupId(postId: string): Promise<string | null> {
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("group_posts").select("group_id").eq("id", postId).maybeSingle());
  if (error) throw new Error(`getPostGroupId(${postId}): ${error.message}`);
  if (!data) throw new ServiceError("Post not found.", 404);
  return (data.group_id as string | null) ?? null;
}

export async function moderatePost(groupId: string, postId: string, uid: string, action: "approve" | "reject"): Promise<void> {
  const role = await requireMember(groupId, uid);
  if (role === "member") throw new ServiceError("Only a group admin or moderator can moderate posts.", 403);

  const status: PostStatus = action === "approve" ? "published" : "rejected";
  const { error } = await supabaseAdmin.from("group_posts").update({ status }).eq("id", postId).eq("group_id", groupId);
  if (error) throw new Error(`moderatePost(${postId}): ${error.message}`);
}
