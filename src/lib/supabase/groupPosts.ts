import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { canDo, postKindsFor, type PostKind } from "@/lib/communities";
import { getMemberRole, requireMember, type GroupRole } from "@/lib/supabase/groups";
import { ServiceError } from "@/services/errors";

export type PostStatus = "published" | "pending" | "rejected" | "scheduled";
export type VoteValue = 1 | -1 | 0;
export type FeedType = "following" | "latest" | "forYou";

export type GroupPost = {
  kind: PostKind;
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
  kind: PostKind;
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
  input: { title?: string; content: string; mediaUrl?: string | null; kind?: PostKind; scheduledAt?: string | null },
): Promise<{ id: string; status: PostStatus; scheduledAt: string | null }> {
  const trimmedContent = input.content.trim();
  if (!trimmedContent) throw new ServiceError("Write something first.", 400);
  if (trimmedContent.length > MAX_POST_CHARS) throw new ServiceError(`Posts are limited to ${MAX_POST_CHARS} characters.`, 400);
  const trimmedTitle = input.title?.trim() || null;
  if (trimmedTitle && trimmedTitle.length > MAX_TITLE_CHARS) throw new ServiceError(`Titles are limited to ${MAX_TITLE_CHARS} characters.`, 400);

  let status: PostStatus = "published";
  // A post's kind must be one this community actually offers - a Photography community can't be
  // made to hold a Race Discussion by hand-crafting a request, and a personal (community-less) post
  // is always a plain discussion since there's no community to take a vocabulary from.
  let kind: PostKind = "discussion";

  if (groupId !== null) {
    const role = await requireMember(groupId, uid);
    const { data: group, error: groupError } = await supabaseAdmin.from("groups").select("moderation_enabled, community_type, features, permissions").eq("id", groupId).maybeSingle();
    if (groupError) throw new Error(`createPost(${groupId}): ${groupError.message}`);

    if (!canDo(group?.permissions, "post", role)) {
      throw new ServiceError("Only certain roles can post in this community.", 403);
    }

    if (input.kind) {
      // `role` is the real, database-resolved membership role from requireMember above - which is
      // what makes Announcement genuinely moderator-only rather than a composer-side convention a
      // hand-crafted request could ignore.
      const allowed = postKindsFor(group?.community_type as string | null, group?.features, role);
      if (!allowed.includes(input.kind)) throw new ServiceError("That post type isn't available in this community.", 400);
      kind = input.kind;
    }
    // Admins/moderators bypass their own group's queue - a standard forum convention (the people
    // trusted to approve everyone else's posts don't need their own approved).
    const needsApproval = !!group?.moderation_enabled && role === "member";
    status = needsApproval ? "pending" : "published";
  }

  // Scheduling is resolved AFTER moderation, and deliberately never overrides it: a post that would
  // have gone to a community's approval queue still does, at the time it is published, rather than
  // using a future timestamp to slip past the queue. Only a post that would have gone straight live
  // can be scheduled.
  const scheduledAt = parseScheduledAt(input.scheduledAt);
  if (scheduledAt && status === "published") status = "scheduled";

  const { data, error } = await supabaseAdmin
    .from("group_posts")
    .insert({
      group_id: groupId,
      user_id: uid,
      title: trimmedTitle,
      content: trimmedContent,
      media_url: input.mediaUrl ?? null,
      status,
      kind,
      scheduled_at: status === "scheduled" ? scheduledAt : null,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new ServiceError("Could not create post.", 500);
  return { id: data.id as string, status, scheduledAt: status === "scheduled" ? scheduledAt : null };
}

/** How far ahead a post may be scheduled. A year is generous for a race calendar and still bounds
 * the queue - a post dated 3024 would otherwise sit in `scheduled` forever. */
const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
/** Anything less than this is "now" in practice, and treating it as a schedule would mean the post
 * vanishes until the next publisher run for no benefit. */
const MIN_SCHEDULE_AHEAD_MS = 60 * 1000;

function parseScheduledAt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) throw new ServiceError("That scheduled time isn't a valid date.", 400);
  const delta = at.getTime() - Date.now();
  if (delta < MIN_SCHEDULE_AHEAD_MS) throw new ServiceError("Pick a time at least a minute from now.", 400);
  if (delta > MAX_SCHEDULE_AHEAD_MS) throw new ServiceError("Posts can be scheduled up to a year ahead.", 400);
  return at.toISOString();
}

/**
 * Publishes every scheduled post whose time has come. Idempotent by construction: the update is
 * filtered on `status = 'scheduled'`, so a second run (an overlapping cron invocation, a manual
 * trigger) matches nothing already published and cannot double-publish or reorder anything.
 *
 * Returns the number actually flipped, so the caller can log something real.
 */
export async function publishDueScheduledPosts(now = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("group_posts")
    .update({ status: "published" })
    .eq("status", "scheduled")
    .lte("scheduled_at", now.toISOString())
    .select("id");
  if (error) throw new Error(`publishDueScheduledPosts: ${error.message}`);
  return (data ?? []).length;
}

/** Everyone sees published posts; a post's own author also sees it while pending/rejected; an
 * admin/moderator additionally sees every pending post from anyone (the moderation queue). */
const GROUP_PAGE_SIZE = 15;

/** One community's own feed, cursor-paginated the same way the cross-community feed already was.
 * It previously fetched EVERY post in the community on every page load and rendered the lot - fine
 * at 11 posts, not at 11,000. `mediaOnly` powers the Media module, which is a view over this same
 * table rather than a second store.
 *
 * The cursor is the last row's created_at, matching listFeedPosts. Ties are possible in principle
 * (two posts in the same millisecond) and would drop a row; in practice created_at is a timestamptz
 * with microsecond precision and posts come from human typing, so it isn't reachable here.
 * ponytail: if it ever is, the fix is a (created_at, id) composite cursor, not a rewrite. */
export async function listPosts(
  groupId: string,
  uid: string,
  opts: ListPostsOptions = {},
): Promise<{ posts: GroupPost[]; nextCursor: string | null }> {
  const role = await requireMember(groupId, uid);
  const canModerate = role === "admin" || role === "moderator";
  const limit = opts.limit ?? GROUP_PAGE_SIZE;
  const sort: PostSort = opts.sort ?? "new";
  // "top" and "discussed" rank on counts that live in other tables, which is what makes them a
  // different pagination model from the two chronological sorts - see the comment below.
  const ranked = sort === "top" || sort === "discussed";

  const visibilityFilter = canModerate ? `status.eq.published,status.eq.pending,user_id.eq.${uid}` : `status.eq.published,user_id.eq.${uid}`;

  /** One place that turns the caller's filters into a query, so the two pagination branches below
   * can't drift apart on what they're actually filtering. */
  function filtered() {
    let b = supabaseAdmin.from("group_posts").select("*").eq("group_id", groupId).or(visibilityFilter);
    if (opts.mediaOnly) b = b.not("media_url", "is", null);
    if (opts.kind) b = b.eq("kind", opts.kind);
    if (opts.authorId) b = b.eq("user_id", opts.authorId);
    // The moderation queue as its own view. Only a moderator can ask for it - for anyone else the
    // `or(...)` above already limits pending posts to their own, so this would quietly be a
    // "my posts awaiting approval" filter rather than the queue they asked for.
    if (opts.pendingOnly && canModerate) b = b.eq("status", "pending");
    const term = postgrestLikeTerm(opts.query);
    // Title AND content, so searching for a word that only appears in the body still finds the
    // thread. Case-insensitive, and escaped (see postgrestLikeTerm) because a bare comma or
    // parenthesis in a search term is PostgREST's own `or()` syntax.
    if (term) b = b.or(`title.ilike.${term},content.ilike.${term}`);
    return b;
  }

  // Two genuinely different pagination models, because "newest first" and "highest score" are
  // different questions:
  //
  //  - new/old: a real keyset cursor on created_at - O(page), unbounded history, and stable while
  //    people keep posting. Unchanged from before this existed.
  //  - top/discussed: score and comment count are not columns on group_posts (they're counts over
  //    group_post_votes / group_post_comments), so the database cannot order or keyset-paginate on
  //    them. This ranks a bounded, explicit window - the community's most recent RANKED_WINDOW
  //    posts - and pages through it by offset. The bound is the honest trade, and it's stated in
  //    the UI: "top posts of this community's recent history", not a claim to have ranked all of
  //    it. Ranking the whole table would mean loading the whole table.
  let rows: Record<string, unknown>[];
  let offset = 0;

  if (ranked) {
    offset = parseOffsetCursor(opts.cursor);
    const { data, error } = await queryWithRetry(() => filtered().order("created_at", { ascending: false }).limit(RANKED_WINDOW));
    if (error) throw new Error(`listPosts(${groupId}): ${error.message}`);
    if (!data?.length) return { posts: [], nextCursor: null };
    rows = data as Record<string, unknown>[];
  } else {
    const ascending = sort === "old";
    let b = filtered().order("created_at", { ascending }).limit(limit + 1);
    if (opts.cursor) b = ascending ? b.gt("created_at", opts.cursor) : b.lt("created_at", opts.cursor);
    const { data, error } = await queryWithRetry(() => b);
    if (error) throw new Error(`listPosts(${groupId}): ${error.message}`);
    if (!data?.length) return { posts: [], nextCursor: null };
    rows = data as Record<string, unknown>[];
  }

  const hasMoreChronological = !ranked && rows.length > limit;
  // The ranked branch enriches its whole window (it has to - it can't know which posts rank highest
  // until every candidate's score is counted), then slices the requested page out afterwards.
  const enriching = ranked ? rows : hasMoreChronological ? rows.slice(0, limit) : rows;

  const postIds = enriching.map((p) => p.id as string);
  const authorIds = [...new Set(enriching.map((p) => p.user_id as string))];
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

  const mapped: GroupPost[] = enriching.map((p) => ({
    id: p.id as string,
    groupId: p.group_id as string,
    userId: p.user_id as string,
    authorName: nameFor(profileById.get(p.user_id as string), p.user_id as string),
    authorRole: roleByAuthor.get(p.user_id as string) ?? "member",
    title: (p.title as string | null) ?? null,
    content: p.content as string,
    mediaUrl: (p.media_url as string | null) ?? null,
    kind: (p.kind as PostKind | null) ?? "discussion",
    status: p.status as PostStatus,
    createdAt: p.created_at as string,
    score: scoreByTarget.get(p.id as string) ?? 0,
    myVote: myVoteByTarget.get(p.id as string) ?? 0,
    commentCount: commentCounts.get(p.id as string) ?? 0,
  }));

  if (ranked) {
    const rank = (post: GroupPost) => (sort === "top" ? post.score : post.commentCount);
    // createdAt breaks ties, so a window full of zero-score posts still comes back newest-first
    // rather than in whatever order the rows happened to arrive.
    mapped.sort((a, b) => rank(b) - rank(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const page = mapped.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return { posts: page, nextCursor: nextOffset < mapped.length ? `${OFFSET_CURSOR_PREFIX}${nextOffset}` : null };
  }

  return { posts: mapped, nextCursor: hasMoreChronological ? (enriching[enriching.length - 1].created_at as string) : null };
}

/**
 * One post by id, with the same enrichment (author, role, score, the viewer's own vote, comment
 * count) every feed row gets - so a permalink opens the exact same card the feed would have shown.
 *
 * Membership is re-derived from the post's OWN group here, never trusted from a caller: a member of
 * community A cannot read community B's post by guessing an id. A personal post (group_id null) has
 * no membership to check and is readable by anyone signed in, matching listFeedPosts' own treatment
 * of personal posts. A post that isn't published is visible only to its author and, in a community,
 * to someone who can moderate it - the same visibility rule listPosts applies.
 */
export async function getPostById(postId: string, uid: string): Promise<GroupPost | null> {
  const { data: post, error } = await queryWithRetry(() => supabaseAdmin.from("group_posts").select("*").eq("id", postId).maybeSingle());
  if (error) throw new Error(`getPostById(${postId}): ${error.message}`);
  if (!post) return null;

  const groupId = (post.group_id as string | null) ?? null;
  const role = groupId ? await requireMember(groupId, uid) : null;
  const canModerate = role === "admin" || role === "moderator";
  const status = post.status as PostStatus;
  const isMine = (post.user_id as string) === uid;
  if (status !== "published" && !isMine && !canModerate) return null;

  const [{ data: votes, error: votesError }, { data: comments, error: commentsError }, profileById] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_post_votes").select("post_id, user_id, value").eq("post_id", postId)),
    queryWithRetry(() => supabaseAdmin.from("group_post_comments").select("post_id").eq("post_id", postId)),
    profilesById([post.user_id as string]),
  ]);
  if (votesError) throw new Error(`getPostById(${postId}): ${votesError.message}`);
  if (commentsError) throw new Error(`getPostById(${postId}): ${commentsError.message}`);

  const { scoreByTarget, myVoteByTarget } = tallyVotes(votes, uid);
  const authorRole = groupId ? ((await getMemberRole(groupId, post.user_id as string)) ?? "member") : "member";

  return {
    id: post.id as string,
    groupId: (groupId ?? "") as string,
    userId: post.user_id as string,
    authorName: nameFor(profileById.get(post.user_id as string), post.user_id as string),
    authorRole,
    title: (post.title as string | null) ?? null,
    content: post.content as string,
    mediaUrl: (post.media_url as string | null) ?? null,
    kind: (post.kind as PostKind | null) ?? "discussion",
    status,
    createdAt: post.created_at as string,
    score: scoreByTarget.get(postId) ?? 0,
    myVote: myVoteByTarget.get(postId) ?? 0,
    commentCount: (comments ?? []).length,
  };
}

/** How a community's feed is ordered. Every one of these is computed from data that really exists:
 * two chronological, two from real vote/comment counts. */
export type PostSort = "new" | "old" | "top" | "discussed";

export type ListPostsOptions = {
  cursor?: string;
  limit?: number;
  mediaOnly?: boolean;
  sort?: PostSort;
  /** One `group_posts.kind` - what the feed's Announcements / Race Weekend / Predictions chips do. */
  kind?: PostKind;
  /** Free text, matched case-insensitively against title and content. */
  query?: string;
  /** Narrows to one author - the feed's "Only my posts" filter passes the viewer's own id. */
  authorId?: string;
  /** The moderation queue. Ignored for anyone who can't moderate this community. */
  pendingOnly?: boolean;
};

/** How many recent posts a "top"/"most discussed" page ranks over. Large enough that the top of a
 * real community's recent history is genuinely in it, small enough that the vote/comment enrichment
 * below stays three bounded `in (...)` queries rather than a table scan. */
const RANKED_WINDOW = 200;

const OFFSET_CURSOR_PREFIX = "off:";

/** The ranked sorts page by position within their window, so their cursor is an offset rather than
 * a timestamp. Prefixed so the two cursor vocabularies can never be confused for one another - a
 * timestamp cursor arriving on a ranked request (switching sort mid-scroll, a stale client) parses
 * to 0 and restarts the list rather than throwing or silently skipping posts. */
function parseOffsetCursor(cursor: string | undefined): number {
  if (!cursor?.startsWith(OFFSET_CURSOR_PREFIX)) return 0;
  const parsed = Number.parseInt(cursor.slice(OFFSET_CURSOR_PREFIX.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** The longest search term accepted. Past this it's not a search, it's a way to make the database
 * scan every post in a community for a string nobody typed on purpose. */
const MAX_SEARCH_CHARS = 80;

/**
 * A user's search text as a PostgREST `ilike` pattern, or null when there's nothing to search for.
 *
 * Two real hazards, both closed here rather than at each call site:
 *  - `,` `(` `)` `.` and `:` are PostgREST's own `or()` filter syntax. Left raw, a term containing
 *    one either errors or - worse - parses as extra filter clauses.
 *  - `%` and `_` are SQL LIKE wildcards. A search for "100%" must look for a literal percent sign,
 *    not "anything at all".
 */
function postgrestLikeTerm(raw: string | undefined): string | null {
  const trimmed = raw?.trim().slice(0, MAX_SEARCH_CHARS);
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,().:]/g, " ");
  const collapsed = escaped.replace(/\s+/g, " ").trim();
  return collapsed ? `*${collapsed}*` : null;
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
      kind: (p.kind as PostKind | null) ?? "discussion",
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
  const role = await requireMemberIfGrouped(groupId, uid);
  // groupId null is a personal post - there's no community to take a permission policy from, so
  // the only gate is being signed in (already checked by the route).
  if (groupId !== null) {
    const { data: group, error } = await supabaseAdmin.from("groups").select("permissions").eq("id", groupId).maybeSingle();
    if (error) throw new Error(`addComment(${groupId}): ${error.message}`);
    if (!canDo(group?.permissions, "comment", role)) throw new ServiceError("Only certain roles can reply in this community.", 403);
  }

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
