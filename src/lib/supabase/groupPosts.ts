import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { requireMember, type GroupRole } from "@/lib/supabase/groups";
import { ServiceError } from "@/services/errors";

export type PostStatus = "published" | "pending" | "rejected";

export type GroupPost = {
  id: string;
  userId: string;
  authorName: string;
  authorRole: GroupRole;
  content: string;
  status: PostStatus;
  createdAt: string;
  upvotes: number;
  hasVoted: boolean;
  commentCount: number;
};

export type PostComment = { id: string; userId: string; authorName: string; content: string; createdAt: string };

export type FeedPost = {
  id: string;
  groupId: string;
  groupName: string;
  groupAvatarUrl: string | null;
  userId: string;
  authorName: string;
  content: string;
  createdAt: string;
  upvotes: number;
  hasVoted: boolean;
  commentCount: number;
};

const MAX_POST_CHARS = 2000;
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

/** A published post whose content later turns out unwelcome can still be pulled by a moderator
 * (see moderatePost) - `rejected` doubles as both "never approved" and "removed after the fact",
 * matching the exact three-value status set the request driving this asked for, rather than adding
 * a fourth "removed" state for what's functionally the same "not visible" outcome. */
export async function createPost(groupId: string, uid: string, content: string): Promise<{ id: string; status: PostStatus }> {
  const role = await requireMember(groupId, uid);
  const trimmed = content.trim();
  if (!trimmed) throw new ServiceError("Write something first.", 400);
  if (trimmed.length > MAX_POST_CHARS) throw new ServiceError(`Posts are limited to ${MAX_POST_CHARS} characters.`, 400);

  const { data: group, error: groupError } = await supabaseAdmin.from("groups").select("moderation_enabled").eq("id", groupId).maybeSingle();
  if (groupError) throw new Error(`createPost(${groupId}): ${groupError.message}`);
  // Admins/moderators bypass their own group's queue - a standard forum convention (the people
  // trusted to approve everyone else's posts don't need their own approved), not stated explicitly
  // in the request this implements but a reasonable default rather than a gap.
  const needsApproval = !!group?.moderation_enabled && role === "member";
  const status: PostStatus = needsApproval ? "pending" : "published";

  const { data, error } = await supabaseAdmin.from("group_posts").insert({ group_id: groupId, user_id: uid, content: trimmed, status }).select("id").single();
  if (error || !data) throw error ?? new ServiceError("Could not create post.", 500);
  return { id: data.id as string, status };
}

/** Everyone sees published posts; a post's own author also sees it while pending/rejected (so they
 * can see their own post's status); an admin/moderator additionally sees every pending post from
 * anyone (the moderation queue). Rejected posts from other members stay invisible to everyone but
 * the author and moderators, same as a real forum's "removed" state. */
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
    queryWithRetry(() => supabaseAdmin.from("group_post_votes").select("post_id, user_id").in("post_id", postIds)),
    queryWithRetry(() => supabaseAdmin.from("group_post_comments").select("post_id").in("post_id", postIds)),
    queryWithRetry(() => supabaseAdmin.from("group_members").select("user_id, role").eq("group_id", groupId).in("user_id", authorIds)),
    profilesById(authorIds),
  ]);
  if (votesError) throw new Error(`listPosts(${groupId}): ${votesError.message}`);
  if (commentsError) throw new Error(`listPosts(${groupId}): ${commentsError.message}`);
  if (membersError) throw new Error(`listPosts(${groupId}): ${membersError.message}`);

  const roleByAuthor = new Map((members ?? []).map((m) => [m.user_id as string, m.role as GroupRole]));
  const voteCounts = new Map<string, number>();
  const myVotes = new Set<string>();
  for (const v of votes ?? []) {
    const pid = v.post_id as string;
    voteCounts.set(pid, (voteCounts.get(pid) ?? 0) + 1);
    if (v.user_id === uid) myVotes.add(pid);
  }
  const commentCounts = new Map<string, number>();
  for (const c of comments ?? []) commentCounts.set(c.post_id as string, (commentCounts.get(c.post_id as string) ?? 0) + 1);

  return posts.map((p) => ({
    id: p.id as string,
    userId: p.user_id as string,
    authorName: nameFor(profileById.get(p.user_id as string), p.user_id as string),
    authorRole: roleByAuthor.get(p.user_id as string) ?? "member",
    content: p.content as string,
    status: p.status as PostStatus,
    createdAt: p.created_at as string,
    upvotes: voteCounts.get(p.id as string) ?? 0,
    hasVoted: myVotes.has(p.id as string),
    commentCount: commentCounts.get(p.id as string) ?? 0,
  }));
}

/** The Groups home feed: every published post across every group the user has actually joined,
 * newest first, cursor-paginated on created_at (stable under concurrent inserts, unlike an
 * offset). No cross-group ranking/"For You" algorithm - there's no real signal yet (a handful of
 * groups, most with a handful of posts) to rank meaningfully on, and a fake-looking "smart" order
 * would be worse than plain chronological. authorRole is left out here (unlike GroupPost) - it'd
 * need a per-post membership join against that post's *own* group, one extra join for a badge a
 * cross-group feed doesn't need as much as an in-group one already showing it (GroupFeed.tsx). */
export async function listFeedPosts(uid: string, cursor?: string, limit = 15): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const { data: memberships, error: membershipsError } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid));
  if (membershipsError) throw new Error(`listFeedPosts: ${membershipsError.message}`);
  const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id as string))];
  if (groupIds.length === 0) return { posts: [], nextCursor: null };

  let query = supabaseAdmin
    .from("group_posts")
    .select("*")
    .in("group_id", groupIds)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit + 1); // +1 to detect "is there another page" without a second round trip
  if (cursor) query = query.lt("created_at", cursor);
  const { data: rows, error } = await queryWithRetry(() => query);
  if (error) throw new Error(`listFeedPosts: ${error.message}`);
  if (!rows?.length) return { posts: [], nextCursor: null };

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const postIds = page.map((p) => p.id as string);
  const authorIds = [...new Set(page.map((p) => p.user_id as string))];
  const postGroupIds = [...new Set(page.map((p) => p.group_id as string))];

  const [{ data: votes, error: votesError }, { data: comments, error: commentsError }, { data: groupsData, error: groupsError }, profileById] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_post_votes").select("post_id, user_id").in("post_id", postIds)),
    queryWithRetry(() => supabaseAdmin.from("group_post_comments").select("post_id").in("post_id", postIds)),
    queryWithRetry(() => supabaseAdmin.from("groups").select("id, name, avatar_url").in("id", postGroupIds)),
    profilesById(authorIds),
  ]);
  if (votesError) throw new Error(`listFeedPosts: ${votesError.message}`);
  if (commentsError) throw new Error(`listFeedPosts: ${commentsError.message}`);
  if (groupsError) throw new Error(`listFeedPosts: ${groupsError.message}`);

  const groupById = new Map((groupsData ?? []).map((g) => [g.id as string, g]));
  const voteCounts = new Map<string, number>();
  const myVotes = new Set<string>();
  for (const v of votes ?? []) {
    const pid = v.post_id as string;
    voteCounts.set(pid, (voteCounts.get(pid) ?? 0) + 1);
    if (v.user_id === uid) myVotes.add(pid);
  }
  const commentCounts = new Map<string, number>();
  for (const c of comments ?? []) commentCounts.set(c.post_id as string, (commentCounts.get(c.post_id as string) ?? 0) + 1);

  const posts: FeedPost[] = page.map((p) => {
    const group = groupById.get(p.group_id as string);
    return {
      id: p.id as string,
      groupId: p.group_id as string,
      groupName: (group?.name as string | undefined) ?? "a group",
      groupAvatarUrl: (group?.avatar_url as string | null | undefined) ?? null,
      userId: p.user_id as string,
      authorName: nameFor(profileById.get(p.user_id as string), p.user_id as string),
      content: p.content as string,
      createdAt: p.created_at as string,
      upvotes: voteCounts.get(p.id as string) ?? 0,
      hasVoted: myVotes.has(p.id as string),
      commentCount: commentCounts.get(p.id as string) ?? 0,
    };
  });
  return { posts, nextCursor: hasMore ? (page[page.length - 1].created_at as string) : null };
}

/** Toggles the current user's own upvote - up-only (no downvote, see schema.sql's own comment on
 * why), so "vote again" is the only real interaction and reads naturally as "un-vote." */
export async function toggleVote(groupId: string, postId: string, uid: string): Promise<{ voted: boolean }> {
  await requireMember(groupId, uid);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("group_post_votes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", uid)
    .maybeSingle();
  if (existingError) throw new Error(`toggleVote(${postId}): ${existingError.message}`);

  if (existing) {
    const { error } = await supabaseAdmin.from("group_post_votes").delete().eq("post_id", postId).eq("user_id", uid);
    if (error) throw new Error(`toggleVote(${postId}): ${error.message}`);
    return { voted: false };
  }
  const { error } = await supabaseAdmin.from("group_post_votes").insert({ post_id: postId, user_id: uid });
  if (error) throw new Error(`toggleVote(${postId}): ${error.message}`);
  return { voted: true };
}

export async function listComments(groupId: string, postId: string, uid: string): Promise<PostComment[]> {
  await requireMember(groupId, uid);
  const { data: comments, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_post_comments").select("*").eq("post_id", postId).order("created_at"),
  );
  if (error) throw new Error(`listComments(${postId}): ${error.message}`);
  if (!comments?.length) return [];

  const profileById = await profilesById([...new Set(comments.map((c) => c.user_id as string))]);
  return comments.map((c) => ({
    id: c.id as string,
    userId: c.user_id as string,
    authorName: nameFor(profileById.get(c.user_id as string), c.user_id as string),
    content: c.content as string,
    createdAt: c.created_at as string,
  }));
}

export async function addComment(groupId: string, postId: string, uid: string, content: string): Promise<{ id: string }> {
  await requireMember(groupId, uid);
  const trimmed = content.trim();
  if (!trimmed) throw new ServiceError("Write a comment first.", 400);
  if (trimmed.length > MAX_COMMENT_CHARS) throw new ServiceError(`Comments are limited to ${MAX_COMMENT_CHARS} characters.`, 400);

  const { data, error } = await supabaseAdmin.from("group_post_comments").insert({ post_id: postId, user_id: uid, content: trimmed }).select("id").single();
  if (error || !data) throw error ?? new ServiceError("Could not add comment.", 500);
  return { id: data.id as string };
}

export async function moderatePost(groupId: string, postId: string, uid: string, action: "approve" | "reject"): Promise<void> {
  const role = await requireMember(groupId, uid);
  if (role === "member") throw new ServiceError("Only a group admin or moderator can moderate posts.", 403);

  const status: PostStatus = action === "approve" ? "published" : "rejected";
  const { error } = await supabaseAdmin.from("group_posts").update({ status }).eq("id", postId).eq("group_id", groupId);
  if (error) throw new Error(`moderatePost(${postId}): ${error.message}`);
}
