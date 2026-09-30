import { escapeHtml, singleLine, trustedOrigin } from "@/lib/html";
import { unstable_cache, revalidateTag } from "next/cache";
import {
  canDo,
  isCommunityType,
  MAX_TAGLINE_CHARS,
  isVisibility,
  normalizeTags,
  normalizeTopic,
  sortDiscover,
  type DiscoverSort,
  type CommunityFeatures,
  type CommunityPermissions,
  type CommunityType,
  type CommunityVisibility,
} from "@/lib/communities";
import { getTransporter } from "@/lib/otp";
import { signInviteToken, verifyInviteToken } from "@/lib/inviteTokens";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { ServiceError } from "@/services/errors";

// Tagged AND short-TTL, not one or the other: every in-app mutation below that actually changes
// what listPublicGroups/getGroupPreview display (name/description/visibility/avatar/banner/member
// count) calls revalidateTag(GROUP_DISCOVERY_TAG) right after its write - since these mutations run
// in the same Next.js process as the cache itself, this is a plain synchronous call, not the
// pipeline's cross-process HTTP-plus-secret dance. The 20s revalidate stays too, as a self-healing
// backstop in case a future mutation is ever added here and someone forgets to tag it - unlike
// races/archive/media/calendar (revalidate: false, tag-only), there's no pipeline script watching
// this table, so a missed tag call would otherwise mean staying stale forever, not just until the
// next scheduled pipeline run.
const GROUP_DISCOVERY_TAG = "group-discovery";
const GROUP_DISCOVERY_REVALIDATE_SECONDS = 20;

export type GroupRole = "admin" | "moderator" | "member";
// Re-exported from the pure communities vocabulary rather than redeclared, so "what visibilities
// exist" has exactly one definition - this alias only exists so the ~20 existing call sites that
// import GroupVisibility from here keep compiling unchanged. Now includes 'hidden'.
export type GroupVisibility = CommunityVisibility;
export type PickSlotResult = "exact" | "podium" | "miss";

/** The community-shape fields every surface needs alongside a group's identity. Grouped into one
 * reused type rather than repeated across GroupSummary/GroupPreview/PublicGroupSummary/GroupDetail,
 * since all four now carry exactly the same four columns. `features` stays raw here; callers run it
 * through resolveModules() (which is what applies type defaults and the F1-only guard). */
export type CommunityShape = {
  communityType: CommunityType;
  topic: string | null;
  tags: string[];
  features: CommunityFeatures;
  permissions: CommunityPermissions;
};

/** Reads the community-shape columns off a raw `groups` row, tolerating rows written before this
 * migration (or by a newer deploy) rather than trusting the column to be populated. */
function communityShapeOf(row: Record<string, unknown>): CommunityShape {
  const rawType = row.community_type;
  return {
    communityType: isCommunityType(rawType) ? rawType : "general",
    topic: (row.topic as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    features: row.features && typeof row.features === "object" && !Array.isArray(row.features) ? (row.features as CommunityFeatures) : {},
    permissions: row.permissions && typeof row.permissions === "object" && !Array.isArray(row.permissions) ? (row.permissions as CommunityPermissions) : {},
  };
}

/** The columns communityShapeOf() needs, appended to an explicit `select(...)` list. */
const COMMUNITY_SHAPE_COLUMNS = "community_type, topic, tags, features, permissions";

// A group card's own "why should I click this right now" signals - all real, all derived straight
// from group_posts/group_predictions, never a fabricated count or label.
export type LatestPost = { authorName: string; createdAt: string; content: string };

export type GroupSummary = CommunityShape & {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  memberCount: number;
  visibility: GroupVisibility;
  myRole: GroupRole;
  createdAt: string;
  activePredictions: number;
  weeklyPosts: number;
  latestPost: LatestPost | null;
  // The existing picks-based group_race_scores leaderboard - a different number from the new
  // points_balance wallet (see points.ts), deliberately: this is "how good are your predictions in
  // this specific group," the wallet is "how many virtual points do you have to wager." Null when
  // nobody in the group has a scored race yet.
  myRank: number | null;
  leader: { name: string; totalScore: number } | null;
};

export type GroupPreview = CommunityShape & { id: string; name: string; description: string | null; avatarUrl: string | null; bannerUrl: string | null; memberCount: number; visibility: GroupVisibility };

export type PublicGroupSummary = CommunityShape & {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  memberCount: number;
  createdAt: string;
  activePredictions: number;
  weeklyPosts: number;
  latestPost: LatestPost | null;
  // Whether the signed-in visitor already belongs to this (public) group - lets Discover show
  // "View Group" instead of "Join Group" for a group they're already in. Always false when nobody
  // is signed in (listPublicGroups' own doc comment covers why sign-in isn't required to browse).
  isMember: boolean;
};

export type GroupMember = {
  userId: string;
  displayName: string | null;
  username: string | null;
  role: GroupRole;
  joinedAt: string;
  points: number;
};

export type GroupDetail = CommunityShape & {
  id: string;
  name: string;
  description: string | null;
  /** A short line rendered OVER the cover image (see the 20260918_community_page migration for why
   * it isn't just `description`). Read only here, from a `select("*")`, so a deploy that hasn't
   * applied that migration yet reads it as null and the overlay simply doesn't render - rather than
   * every community query failing on an unknown column. */
  tagline: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  visibility: GroupVisibility;
  moderationEnabled: boolean;
  createdBy: string;
  createdAt: string;
  myRole: GroupRole;
  members: GroupMember[];
};

export type LeaderboardRow = {
  userId: string;
  displayName: string | null;
  username: string | null;
  totalScore: number;
  racesScored: number;
  rank: number;
};

export type RaceScoreRow = {
  userId: string;
  displayName: string | null;
  username: string | null;
  score: number;
  rank: number;
  breakdown: Record<"p1" | "p2" | "p3", PickSlotResult> | null;
};

type ProfileLite = { id: string; display_name: string | null; username: string | null; points_balance: number };

async function profilesById(userIds: string[]): Promise<Map<string, ProfileLite>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("profiles").select("id, display_name, username, points_balance").in("id", userIds),
  );
  if (error) throw new Error(`profilesById: ${error.message}`);
  return new Map((data ?? []).map((p) => [p.id as string, p as ProfileLite]));
}

/** Every group read below needs this first — `supabaseAdmin` bypasses RLS entirely (same trust
 * model as every other table this app touches), so "only members can see this" is an application
 * rule enforced here, not something the database backstops for this service. */
export async function getMemberRole(groupId: string, uid: string): Promise<GroupRole | null> {
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("role").eq("group_id", groupId).eq("user_id", uid).maybeSingle(),
  );
  if (error) throw new Error(`getMemberRole(${groupId}, ${uid}): ${error.message}`);
  return (data?.role as GroupRole | undefined) ?? null;
}

// Exported - groupPredictions.ts and groupPosts.ts both need the exact same "are you actually in
// this group" / "are you actually an admin of it" checks, and supabaseAdmin bypasses RLS entirely
// (see getMemberRole's own comment), so this application-level check is the real enforcement for
// every one of those tables too, not just the ones defined in this file.
export async function requireMember(groupId: string, uid: string): Promise<GroupRole> {
  const role = await getMemberRole(groupId, uid);
  if (!role) throw new ServiceError("You're not a member of this group.", 403);
  return role;
}

// Moderators can approve/reject posts (see groupPosts.ts) but everything else - settings, member
// management, creating predictions, deleting a group - is admin-only, matching the role table in
// the request that drove this redesign.
export async function requireAdmin(groupId: string, uid: string): Promise<void> {
  const role = await requireMember(groupId, uid);
  if (role !== "admin") throw new ServiceError("Only a group admin can do that.", 403);
}

// Per-group rank/leader for the group cards on the main Groups page - the same ranking logic
// getGroupLeaderboard uses, just computed for every one of a user's groups in one batched query
// instead of N separate calls (one per card).
function rankWithinGroups(scores: { group_id: string; user_id: string; score: number }[]): Map<string, { userId: string; totalScore: number; rank: number }[]> {
  const byGroup = new Map<string, Map<string, number>>();
  for (const row of scores) {
    const totals = byGroup.get(row.group_id) ?? new Map<string, number>();
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.score);
    byGroup.set(row.group_id, totals);
  }
  const result = new Map<string, { userId: string; totalScore: number; rank: number }[]>();
  for (const [groupId, totals] of byGroup) {
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    let rank = 0;
    let prevScore: number | null = null;
    result.set(
      groupId,
      sorted.map(([userId, totalScore], index) => {
        if (totalScore !== prevScore) rank = index + 1;
        prevScore = totalScore;
        return { userId, totalScore, rank };
      }),
    );
  }
  return result;
}

// The real "why open this group" signal for a card - the most recent published post per group
// (already-sorted single query, first occurrence per group_id wins in the reduce below), not a
// fabricated activity feed. Shared by getUserGroups and listPublicGroups.
/** One query, two real signals per group: the most recent published post (for a card's "Latest:
 * ..." preview) and how many were posted in the last 7 days (for "12 posts this week") - both
 * derived from the same result set, so this doesn't cost a second round trip. */
async function groupActivitySignals(groupIds: string[]): Promise<{ latestByGroup: Map<string, LatestPost>; weeklyPosts: Map<string, number> }> {
  if (groupIds.length === 0) return { latestByGroup: new Map(), weeklyPosts: new Map() };
  const { data: posts, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_posts").select("group_id, user_id, created_at, content").in("group_id", groupIds).eq("status", "published").order("created_at", { ascending: false }),
  );
  if (error) throw new Error(`groupActivitySignals: ${error.message}`);
  if (!posts?.length) return { latestByGroup: new Map(), weeklyPosts: new Map() };

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const firstSeen = new Map<string, { user_id: string; created_at: string; content: string }>();
  const weeklyPosts = new Map<string, number>();
  for (const p of posts) {
    const groupId = p.group_id as string;
    if (!firstSeen.has(groupId)) firstSeen.set(groupId, { user_id: p.user_id as string, created_at: p.created_at as string, content: p.content as string });
    if (new Date(p.created_at as string).getTime() >= weekAgo) weeklyPosts.set(groupId, (weeklyPosts.get(groupId) ?? 0) + 1);
  }
  const profileById = await profilesById([...firstSeen.values()].map((v) => v.user_id));
  const latestByGroup = new Map(
    [...firstSeen.entries()].map(([groupId, v]) => [groupId, { authorName: profileById.get(v.user_id)?.display_name ?? "A member", createdAt: v.created_at, content: v.content }]),
  );
  return { latestByGroup, weeklyPosts };
}

export async function getUserGroups(uid: string): Promise<GroupSummary[]> {
  const { data: memberships, error: membershipsError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("group_id, role").eq("user_id", uid),
  );
  if (membershipsError) throw new Error(`getUserGroups(${uid}): ${membershipsError.message}`);
  if (!memberships?.length) return [];

  const groupIds = memberships.map((m) => m.group_id as string);
  const [
    { data: groups, error: groupsError },
    { data: allMembers, error: allMembersError },
    { data: scores, error: scoresError },
    { data: predictions, error: predictionsError },
    activitySignals,
  ] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("groups").select(`id, name, description, avatar_url, banner_url, visibility, created_at, ${COMMUNITY_SHAPE_COLUMNS}`).in("id", groupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").in("group_id", groupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_race_scores").select("group_id, user_id, score").in("group_id", groupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_predictions").select("group_id").in("group_id", groupIds).eq("status", "open")),
    groupActivitySignals(groupIds),
  ]);
  if (groupsError) throw new Error(`getUserGroups(${uid}): ${groupsError.message}`);
  if (allMembersError) throw new Error(`getUserGroups(${uid}): ${allMembersError.message}`);
  if (scoresError) throw new Error(`getUserGroups(${uid}): ${scoresError.message}`);
  if (predictionsError) throw new Error(`getUserGroups(${uid}): ${predictionsError.message}`);

  const memberCounts = new Map<string, number>();
  for (const m of allMembers ?? []) memberCounts.set(m.group_id as string, (memberCounts.get(m.group_id as string) ?? 0) + 1);
  const roleByGroup = new Map(memberships.map((m) => [m.group_id as string, m.role as GroupRole]));
  const activePredictionCounts = new Map<string, number>();
  for (const p of predictions ?? []) activePredictionCounts.set(p.group_id as string, (activePredictionCounts.get(p.group_id as string) ?? 0) + 1);
  const ranksByGroup = rankWithinGroups((scores ?? []) as { group_id: string; user_id: string; score: number }[]);

  const leaderIds = [...ranksByGroup.values()].map((rows) => rows[0]?.userId).filter((id): id is string => !!id);
  const leaderProfiles = await profilesById(leaderIds);

  return (groups ?? [])
    .map((g) => {
      const groupId = g.id as string;
      const ranked = ranksByGroup.get(groupId) ?? [];
      const myRow = ranked.find((r) => r.userId === uid);
      const leaderRow = ranked[0];
      const activePredictions = activePredictionCounts.get(groupId) ?? 0;
      return {
        ...communityShapeOf(g),
        id: groupId,
        name: g.name as string,
        description: (g.description as string | null) ?? null,
        avatarUrl: (g.avatar_url as string | null) ?? null,
        bannerUrl: (g.banner_url as string | null) ?? null,
        memberCount: memberCounts.get(groupId) ?? 1,
        visibility: g.visibility as GroupVisibility,
        myRole: roleByGroup.get(groupId) ?? "member",
        createdAt: g.created_at as string,
        activePredictions,
        weeklyPosts: activitySignals.weeklyPosts.get(groupId) ?? 0,
        latestPost: activitySignals.latestByGroup.get(groupId) ?? null,
        myRank: myRow?.rank ?? null,
        leader: leaderRow ? { name: leaderProfiles.get(leaderRow.userId)?.display_name ?? "Member", totalScore: leaderRow.totalScore } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Re-exported so existing imports from this module keep working; both actually live in the pure
// communities vocabulary, which is what lets them be unit-tested without dragging nodemailer (via
// otp.ts, via this file) into a test process.
export type { DiscoverSort } from "@/lib/communities";

export type DiscoverOptions = {
  query?: string;
  /** Topic names to restrict to. Empty/omitted means every topic. */
  topics?: string[];
  sort?: DiscoverSort;
  /** Opaque offset from a previous page's `nextCursor`. */
  cursor?: string;
  limit?: number;
  uid?: string;
};

export type DiscoverResult = {
  communities: PublicGroupSummary[];
  nextCursor: string | null;
  /** Total matches for the current query/topics, before paging - drives "12 of 48 communities". */
  total: number;
  /** Real topic facets with real counts, computed across everything matching the *search* (but not
   * the topic filter itself, so unticking a topic doesn't make its own chip vanish). Only topics
   * that actually exist on a public community ever appear. */
  facets: { topic: string; count: number }[];
};

const DISCOVER_PAGE_SIZE = 12;

/** Public communities only, opted-in via `visibility = 'public'` - 'private' is discoverable by
 * invite link only and 'hidden' is excluded from every listing by definition.
 *
 * `query` matches name, description, topic and tags, case-insensitively. Not id - an unconditional
 * `id.eq.<text>` clause 500s the whole request the moment someone types a term that isn't a valid
 * uuid.
 *
 * ponytail: sorts and paginates in memory after fetching every match, because three of the five
 * sort keys (recommended/trending/active) rank by signals computed from group_posts and
 * group_predictions rather than by a column Postgres could ORDER BY. A directory this app expects
 * to hold dozens - not millions - of rows makes that the honest trade rather than denormalising an
 * activity counter onto `groups` and keeping it correct. The upgrade path, if this ever holds tens
 * of thousands: a materialized view of (group_id, weekly_posts, open_predictions) refreshed by the
 * pipeline, then ORDER BY/LIMIT against it. Until then paging is real - the server returns one page
 * at a time - it just costs a full scan of a small table to build.
 */
export const discoverCommunities = unstable_cache(
  async (opts: DiscoverOptions): Promise<DiscoverResult> => discoverCommunitiesUncached(opts),
  ["discover-communities"],
  { revalidate: GROUP_DISCOVERY_REVALIDATE_SECONDS, tags: [GROUP_DISCOVERY_TAG] },
);

/** Backward-compatible shim: the flat array shape `homeData.ts` and the original Discover tab were
 * written against. New callers should use discoverCommunities. */
export async function listPublicGroups(query?: string, uid?: string): Promise<PublicGroupSummary[]> {
  const { communities } = await discoverCommunities({ query, uid, limit: 100 });
  return communities;
}

async function discoverCommunitiesUncached(opts: DiscoverOptions): Promise<DiscoverResult> {
  const { query, topics, sort = "recommended", cursor, limit = DISCOVER_PAGE_SIZE, uid } = opts;
  const empty: DiscoverResult = { communities: [], nextCursor: null, total: 0, facets: [] };

  let builder = supabaseAdmin.from("groups").select(`id, name, description, avatar_url, banner_url, created_at, ${COMMUNITY_SHAPE_COLUMNS}`).eq("visibility", "public");
  const trimmed = query?.trim();
  if (trimmed) {
    // `tags` is text[], so ilike can't reach it - `cs` (contains) matches an exact lowercased tag,
    // which is what normalizeTags() already guarantees is stored. Name/description/topic stay
    // substring matches.
    const escaped = trimmed.replace(/[%,()]/g, "");
    builder = builder.or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%,topic.ilike.%${escaped}%,tags.cs.{${escaped.toLowerCase()}}`);
  }
  const { data: groups, error } = await queryWithRetry(() => builder.order("created_at", { ascending: false }));
  if (error) throw new Error(`discoverCommunities: ${error.message}`);
  if (!groups?.length) return empty;

  // Facets come from the search result set, BEFORE the topic filter narrows it - otherwise ticking
  // "Gaming" would leave "Gaming" as the only chip on screen and there'd be no way back.
  const facetCounts = new Map<string, number>();
  for (const g of groups) {
    const topic = (g.topic as string | null) ?? null;
    if (topic) facetCounts.set(topic, (facetCounts.get(topic) ?? 0) + 1);
  }
  const facets = [...facetCounts.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));

  const wanted = new Set((topics ?? []).filter(Boolean));
  const matching = wanted.size > 0 ? groups.filter((g) => wanted.has(((g.topic as string | null) ?? ""))) : groups;
  if (matching.length === 0) return { ...empty, facets };

  const groupIds = matching.map((g) => g.id as string);
  const [{ data: allMembers, error: membersError }, { data: predictions, error: predictionsError }, activitySignals, myMemberships, myTopics] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").in("group_id", groupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_predictions").select("group_id").in("group_id", groupIds).eq("status", "open")),
    groupActivitySignals(groupIds),
    uid
      ? queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid).in("group_id", groupIds))
      : Promise.resolve({ data: [] as { group_id: string }[], error: null }),
    // The one real input "Recommended" has: the topics of the communities this user already joined.
    // Not an F1-only signal - it works identically for someone whose only community is Photography.
    uid ? topicsOfMyCommunities(uid) : Promise.resolve(new Set<string>()),
  ]);
  if (membersError) throw new Error(`discoverCommunities: ${membersError.message}`);
  if (predictionsError) throw new Error(`discoverCommunities: ${predictionsError.message}`);
  if (myMemberships.error) throw new Error(`discoverCommunities: ${myMemberships.error.message}`);
  const memberCounts = new Map<string, number>();
  for (const m of allMembers ?? []) memberCounts.set(m.group_id as string, (memberCounts.get(m.group_id as string) ?? 0) + 1);
  const activePredictionCounts = new Map<string, number>();
  for (const p of predictions ?? []) activePredictionCounts.set(p.group_id as string, (activePredictionCounts.get(p.group_id as string) ?? 0) + 1);
  const myGroupIds = new Set((myMemberships.data ?? []).map((m) => m.group_id as string));

  const all: PublicGroupSummary[] = matching.map((g) => {
    const groupId = g.id as string;
    return {
      ...communityShapeOf(g),
      id: groupId,
      name: g.name as string,
      description: (g.description as string | null) ?? null,
      avatarUrl: (g.avatar_url as string | null) ?? null,
      bannerUrl: (g.banner_url as string | null) ?? null,
      memberCount: memberCounts.get(groupId) ?? 0,
      createdAt: g.created_at as string,
      activePredictions: activePredictionCounts.get(groupId) ?? 0,
      weeklyPosts: activitySignals.weeklyPosts.get(groupId) ?? 0,
      latestPost: activitySignals.latestByGroup.get(groupId) ?? null,
      isMember: myGroupIds.has(groupId),
    };
  });

  const sorted = sortDiscover(all, sort, myTopics);
  const offset = Number.parseInt(cursor ?? "0", 10);
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const page = sorted.slice(start, start + limit);
  const nextOffset = start + page.length;

  return {
    communities: page,
    nextCursor: nextOffset < sorted.length ? String(nextOffset) : null,
    total: sorted.length,
    facets,
  };
}

/** Every distinct topic across the communities this user already belongs to. */
async function topicsOfMyCommunities(uid: string): Promise<Set<string>> {
  const { data: memberships, error } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid));
  if (error) throw new Error(`topicsOfMyCommunities: ${error.message}`);
  const ids = (memberships ?? []).map((m) => m.group_id as string);
  if (ids.length === 0) return new Set();
  const { data: rows, error: topicsError } = await queryWithRetry(() => supabaseAdmin.from("groups").select("topic").in("id", ids));
  if (topicsError) throw new Error(`topicsOfMyCommunities: ${topicsError.message}`);
  return new Set((rows ?? []).map((r) => r.topic as string | null).filter((t): t is string => !!t));
}


/** Enough to decide "do I want to join this" without being a member yet — what a person sees on a
 * community's page before they're in it. Knowing a private community's link lets you see this
 * preview and ask to join; it does NOT let you in - joining needs approval or a signed invitation,
 * enforced by joinGroup (audit SEC-06). A private community isn't discoverable without the link
 * unless it opted into visibility='public' (see listPublicGroups above). */
export const getGroupPreview = unstable_cache(
  async (groupId: string): Promise<GroupPreview | null> => getGroupPreviewUncached(groupId),
  ["get-group-preview"],
  { revalidate: GROUP_DISCOVERY_REVALIDATE_SECONDS, tags: [GROUP_DISCOVERY_TAG] },
);

async function getGroupPreviewUncached(groupId: string): Promise<GroupPreview | null> {
  const { data: group, error: groupError } = await queryWithRetry(() =>
    supabaseAdmin.from("groups").select(`id, name, description, avatar_url, banner_url, visibility, ${COMMUNITY_SHAPE_COLUMNS}`).eq("id", groupId).maybeSingle(),
  );
  if (groupError) throw new Error(`getGroupPreview(${groupId}): ${groupError.message}`);
  if (!group) return null;
  const { count, error: countError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", groupId),
  );
  if (countError) throw new Error(`getGroupPreview(${groupId}): ${countError.message}`);
  return {
    ...communityShapeOf(group),
    id: group.id as string,
    name: group.name as string,
    description: (group.description as string | null) ?? null,
    avatarUrl: (group.avatar_url as string | null) ?? null,
    bannerUrl: (group.banner_url as string | null) ?? null,
    memberCount: count ?? 0,
    visibility: group.visibility as GroupVisibility,
  };
}

// 23505 on groups is always the name-uniqueness index (groups_name_unique_idx, case-insensitive) -
// the only unique constraint that table has besides its own primary key. Shared by createGroup and
// updateGroupSettings so both give the same real, specific error instead of a generic 500.
function isDuplicateNameError(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createGroup(
  uid: string,
  input: {
    name: string;
    description?: string;
    visibility?: GroupVisibility;
    moderationEnabled?: boolean;
    communityType?: CommunityType;
    topic?: string | null;
    tags?: string[];
    features?: CommunityFeatures;
  },
): Promise<{ id: string }> {
  const trimmed = input.name.trim();
  if (trimmed.length < 3 || trimmed.length > 40) {
    throw new ServiceError("Group name must be 3-40 characters.", 400);
  }
  const description = input.description?.trim() || null;
  if (description && description.length > 280) throw new ServiceError("Description must be 280 characters or fewer.", 400);
  // Unknown/absent visibility still falls back to 'private' - the safest default, and the exact
  // behavior this had before 'hidden' existed.
  const visibility: GroupVisibility = isVisibility(input.visibility) ? input.visibility : "private";
  const communityType: CommunityType = isCommunityType(input.communityType) ? input.communityType : "general";
  // A Private Circle that's marked public is a contradiction the create flow shouldn't be able to
  // produce, but the API is callable directly - so the type's own privacy wins here rather than
  // trusting the pair to arrive consistent.
  const effectiveVisibility: GroupVisibility = communityType === "private_circle" && visibility === "public" ? "private" : visibility;

  const { data, error } = await supabaseAdmin
    .from("groups")
    .insert({
      name: trimmed,
      description,
      visibility: effectiveVisibility,
      created_by: uid,
      moderation_enabled: !!input.moderationEnabled,
      community_type: communityType,
      topic: normalizeTopic(input.topic),
      tags: normalizeTags(input.tags),
      // Only the modules the caller actually overrode - `{}` means "this type's defaults", which is
      // what keeps a later type change meaningful (see resolveModules).
      features: input.features && typeof input.features === "object" ? input.features : {},
    })
    .select("id")
    .single();
  if (error && isDuplicateNameError(error)) throw new ServiceError("A group with this name already exists.", 409);
  if (error || !data) throw error ?? new ServiceError("Could not create group.", 500);

  // Paired insert, not a transaction — a group with no members is a state nothing else can reach
  // anyway (this is the only code path that creates one), so there's nothing to roll back to if
  // this second insert somehow failed; not worth procedural SQL for one guaranteed-together pair.
  const { error: memberError } = await supabaseAdmin.from("group_members").insert({ group_id: data.id, user_id: uid, role: "admin" });
  if (memberError) throw memberError;

  revalidateTag(GROUP_DISCOVERY_TAG, "max");
  return { id: data.id as string };
}

/** Translates the join/redeem SQL functions' named failures (20260930_group_access.sql) into
 * ServiceErrors the UI can act on. Anything unrecognised is a real bug and is rethrown. */
function accessError(error: { message: string }): Error {
  const m = error.message;
  if (m.includes("group_not_found")) return new ServiceError("That invite link isn't valid.", 404, "group_not_found");
  if (m.includes("banned")) return new ServiceError("You can't join this community.", 403, "banned");
  if (m.includes("invite_required")) return new ServiceError("This community is private. Ask to join and an admin will review your request.", 403, "request_required");
  if (m.includes("invite_invalid")) return new ServiceError("That invitation isn't valid.", 404, "invite_invalid");
  if (m.includes("invite_revoked")) return new ServiceError("This invitation was cancelled.", 410, "invite_revoked");
  if (m.includes("invite_expired")) return new ServiceError("This invitation has expired.", 410, "invite_expired");
  if (m.includes("invite_exhausted")) return new ServiceError("This invitation has already been used.", 410, "invite_exhausted");
  return new Error(`join: ${m}`);
}

/** Joins a community, enforcing its visibility on the server (audit SEC-06). A PUBLIC community can
 * be joined directly; a private or hidden one needs a valid invitation token (`inviteToken`) - the
 * group's id alone no longer admits anyone. Approval of a join request adds the membership itself
 * (decideJoinRequest), so it never comes through here. */
export async function joinGroup(uid: string, groupId: string, inviteToken?: string | null): Promise<{ id: string; name: string }> {
  const { data: group } = await supabaseAdmin.from("groups").select("id, name").eq("id", groupId).maybeSingle();
  if (!group) throw new ServiceError("That invite link isn't valid.", 404, "group_not_found");

  let result: { joined?: boolean } | null;
  if (inviteToken) {
    const check = verifyInviteToken(inviteToken, groupId);
    if (!check.ok) {
      if (check.reason === "expired") throw new ServiceError("This invitation has expired.", 410, "invite_expired");
      throw new ServiceError("That invitation isn't valid.", 404, "invite_invalid");
    }
    const { data, error } = await supabaseAdmin.rpc("redeem_group_invite", { p_group_id: groupId, p_invite_id: check.inviteId, p_user_id: uid });
    if (error) throw accessError(error);
    result = data as { joined?: boolean };
  } else {
    const { data, error } = await supabaseAdmin.rpc("join_group", { p_group_id: groupId, p_user_id: uid });
    if (error) throw accessError(error);
    result = data as { joined?: boolean };
  }
  if (result?.joined) revalidateTag(GROUP_DISCOVERY_TAG, "max"); // member count / isMember changed
  return { id: group.id as string, name: group.name as string };
}

async function isBanned(groupId: string, uid: string): Promise<boolean> {
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("group_bans").select("user_id").eq("group_id", groupId).eq("user_id", uid).maybeSingle());
  if (error) throw new Error(`isBanned(${groupId}, ${uid}): ${error.message}`);
  return !!data;
}

export async function getGroupDetail(groupId: string, uid: string): Promise<GroupDetail> {
  const myRole = await requireMember(groupId, uid);

  const [{ data: group, error: groupError }, { data: members, error: membersError }] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("groups").select("*").eq("id", groupId).single()),
    queryWithRetry(() => supabaseAdmin.from("group_members").select("user_id, role, joined_at").eq("group_id", groupId).order("joined_at")),
  ]);
  // PGRST116 ("no rows") from .single() is the expected shape of "this group doesn't exist" -
  // not a real failure, so it falls through to the existing 404 below instead of the generic
  // throw every other error here gets.
  if (groupError && groupError.code !== "PGRST116") throw new Error(`getGroupDetail(${groupId}): ${groupError.message}`);
  if (membersError) throw new Error(`getGroupDetail(${groupId}): ${membersError.message}`);
  if (!group) throw new ServiceError("Group not found.", 404);

  const profileById = await profilesById((members ?? []).map((m) => m.user_id as string));

  return {
    ...communityShapeOf(group),
    id: group.id as string,
    name: group.name as string,
    description: (group.description as string | null) ?? null,
    tagline: (group.tagline as string | null) ?? null,
    avatarUrl: (group.avatar_url as string | null) ?? null,
    bannerUrl: (group.banner_url as string | null) ?? null,
    visibility: group.visibility as GroupVisibility,
    moderationEnabled: group.moderation_enabled as boolean,
    createdBy: group.created_by as string,
    createdAt: group.created_at as string,
    myRole,
    members: (members ?? []).map((m) => ({
      userId: m.user_id as string,
      displayName: profileById.get(m.user_id as string)?.display_name ?? null,
      username: profileById.get(m.user_id as string)?.username ?? null,
      role: m.role as GroupRole,
      joinedAt: m.joined_at as string,
      points: profileById.get(m.user_id as string)?.points_balance ?? 0,
    })),
  };
}

/** Aggregates `group_race_scores` (pipeline/compute_group_scores.py) client-side rather than a
 * SQL `sum()`/`rank()` view — this table stays tiny (members x races a group's existed for), so
 * there's no real cost, and it keeps the ranking logic in one place (identical tie handling to
 * the per-race rank the pipeline script already computes) instead of writing it twice, once in
 * SQL and once here. */
export async function getGroupLeaderboard(groupId: string, uid: string): Promise<LeaderboardRow[]> {
  await requireMember(groupId, uid);

  const { data: scores, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_race_scores").select("user_id, score").eq("group_id", groupId),
  );
  if (error) throw new Error(`getGroupLeaderboard(${groupId}): ${error.message}`);
  if (!scores?.length) return [];

  const totals = new Map<string, { totalScore: number; racesScored: number }>();
  for (const row of scores) {
    const userId = row.user_id as string;
    const entry = totals.get(userId) ?? { totalScore: 0, racesScored: 0 };
    entry.totalScore += row.score as number;
    entry.racesScored += 1;
    totals.set(userId, entry);
  }

  const profileById = await profilesById([...totals.keys()]);
  const sorted = [...totals.entries()].sort((a, b) => b[1].totalScore - a[1].totalScore);

  let rank = 0;
  let prevScore: number | null = null;
  return sorted.map(([userId, totalsRow], index) => {
    if (totalsRow.totalScore !== prevScore) rank = index + 1;
    prevScore = totalsRow.totalScore;
    return {
      userId,
      displayName: profileById.get(userId)?.display_name ?? null,
      username: profileById.get(userId)?.username ?? null,
      totalScore: totalsRow.totalScore,
      racesScored: totalsRow.racesScored,
      rank,
    };
  });
}

export async function getGroupRaceScores(groupId: string, raceId: string, uid: string): Promise<RaceScoreRow[]> {
  await requireMember(groupId, uid);
  const { data: scores, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_race_scores").select("user_id, score, rank, breakdown").eq("group_id", groupId).eq("race_id", raceId).order("rank"),
  );
  if (error) throw new Error(`getGroupRaceScores(${groupId}, ${raceId}): ${error.message}`);
  if (!scores?.length) return [];

  const profileById = await profilesById(scores.map((s) => s.user_id as string));
  return scores.map((s) => ({
    userId: s.user_id as string,
    displayName: profileById.get(s.user_id as string)?.display_name ?? null,
    username: profileById.get(s.user_id as string)?.username ?? null,
    score: s.score as number,
    rank: s.rank as number,
    breakdown: (s.breakdown as RaceScoreRow["breakdown"]) ?? null,
  }));
}

export async function updateGroupAvatar(groupId: string, uid: string, avatarUrl: string): Promise<void> {
  await requireAdmin(groupId, uid);
  await supabaseAdmin.from("groups").update({ avatar_url: avatarUrl }).eq("id", groupId);
  revalidateTag(GROUP_DISCOVERY_TAG, "max");
}

export async function updateGroupBanner(groupId: string, uid: string, bannerUrl: string): Promise<void> {
  await requireAdmin(groupId, uid);
  await supabaseAdmin.from("groups").update({ banner_url: bannerUrl }).eq("id", groupId);
  revalidateTag(GROUP_DISCOVERY_TAG, "max");
}

export async function removeGroupBanner(groupId: string, uid: string): Promise<void> {
  await requireAdmin(groupId, uid);
  await supabaseAdmin.from("groups").update({ banner_url: null }).eq("id", groupId);
  revalidateTag(GROUP_DISCOVERY_TAG, "max");
}

export async function updateGroupSettings(
  groupId: string,
  uid: string,
  updates: {
    name?: string;
    description?: string | null;
    tagline?: string | null;
    visibility?: GroupVisibility;
    moderationEnabled?: boolean;
    communityType?: CommunityType;
    topic?: string | null;
    tags?: string[];
    features?: CommunityFeatures;
    permissions?: CommunityPermissions;
  },
): Promise<void> {
  await requireAdmin(groupId, uid);
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (trimmed.length < 3 || trimmed.length > 40) throw new ServiceError("Group name must be 3-40 characters.", 400);
    patch.name = trimmed;
  }
  if (updates.description !== undefined) {
    const trimmed = updates.description?.trim() || null;
    if (trimmed && trimmed.length > 280) throw new ServiceError("Description must be 280 characters or fewer.", 400);
    patch.description = trimmed;
  }
  if (updates.tagline !== undefined) {
    const trimmed = updates.tagline?.trim() || null;
    // Short on purpose: it sits over a cover image at any width, and anything longer stops being a
    // tagline and starts being a paragraph competing with the description right below it.
    if (trimmed && trimmed.length > MAX_TAGLINE_CHARS) throw new ServiceError(`Tagline must be ${MAX_TAGLINE_CHARS} characters or fewer.`, 400);
    patch.tagline = trimmed;
  }
  if (updates.visibility !== undefined) {
    if (!isVisibility(updates.visibility)) throw new ServiceError("Unknown visibility.", 400);
    patch.visibility = updates.visibility;
  }
  if (updates.moderationEnabled !== undefined) patch.moderation_enabled = updates.moderationEnabled;
  if (updates.communityType !== undefined) {
    if (!isCommunityType(updates.communityType)) throw new ServiceError("Unknown community type.", 400);
    patch.community_type = updates.communityType;
  }
  if (updates.topic !== undefined) patch.topic = normalizeTopic(updates.topic);
  if (updates.tags !== undefined) patch.tags = normalizeTags(updates.tags);
  if (updates.features !== undefined) {
    if (!updates.features || typeof updates.features !== "object" || Array.isArray(updates.features)) {
      throw new ServiceError("Invalid features.", 400);
    }
    patch.features = updates.features;
  }
  if (updates.permissions !== undefined) {
    if (!updates.permissions || typeof updates.permissions !== "object" || Array.isArray(updates.permissions)) {
      throw new ServiceError("Invalid permissions.", 400);
    }
    patch.permissions = updates.permissions;
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabaseAdmin.from("groups").update(patch).eq("id", groupId);
  if (error && isDuplicateNameError(error)) throw new ServiceError("A group with this name already exists.", 409);
  if (error) throw new Error(`updateGroupSettings(${groupId}): ${error.message}`);
  revalidateTag(GROUP_DISCOVERY_TAG, "max"); // name/description/visibility all shown on the discovery card
}

async function countAdmins(groupId: string): Promise<number> {
  const { count, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", groupId).eq("role", "admin"),
  );
  if (error) throw new Error(`countAdmins(${groupId}): ${error.message}`);
  return count ?? 0;
}

/** Admin sets another member's role. Guards the one real way this could brick a group: demoting
 * (or removing, below) the sole remaining admin, which would leave nobody able to manage it,
 * approve posts as an admin, or ever promote anyone again. */
export async function updateMemberRole(groupId: string, actingUid: string, targetUid: string, newRole: GroupRole): Promise<void> {
  await requireAdmin(groupId, actingUid);
  const targetRole = await getMemberRole(groupId, targetUid);
  if (!targetRole) throw new ServiceError("That user isn't a member of this group.", 404);

  if (targetRole === "admin" && newRole !== "admin" && (await countAdmins(groupId)) <= 1) {
    throw new ServiceError("A group needs at least one admin - promote someone else first.", 400);
  }

  const { error } = await supabaseAdmin.from("group_members").update({ role: newRole }).eq("group_id", groupId).eq("user_id", targetUid);
  if (error) throw new Error(`updateMemberRole(${groupId}, ${targetUid}): ${error.message}`);
}

/** Removes a member. With `ban`, they are also barred from rejoining (join, invitation redemption
 * and join requests all check group_bans) - without it, removing someone from a PUBLIC community
 * only lasts until they click Join again (audit SEC-06). The ban is recorded before the membership
 * is deleted, so there is no window in which the person is out but free to walk straight back in. */
export async function removeMember(groupId: string, actingUid: string, targetUid: string, opts: { ban?: boolean; reason?: string } = {}): Promise<void> {
  await requireAdmin(groupId, actingUid);
  if (opts.ban && targetUid === actingUid) throw new ServiceError("You can't ban yourself - leave the community instead.", 400);
  const targetRole = await getMemberRole(groupId, targetUid);

  if (targetRole === "admin" && (await countAdmins(groupId)) <= 1) {
    throw new ServiceError("A group needs at least one admin - promote someone else before removing yourself.", 400);
  }

  if (opts.ban) {
    const { error: banError } = await supabaseAdmin
      .from("group_bans")
      .upsert({ group_id: groupId, user_id: targetUid, banned_by: actingUid, reason: opts.reason?.trim().slice(0, 300) || null }, { onConflict: "group_id,user_id" });
    if (banError) throw new Error(`removeMember(${groupId}, ${targetUid}): ${banError.message}`);
  }
  if (!targetRole) return; // already not a member - removing is idempotent

  const { error } = await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", targetUid);
  if (error) throw new Error(`removeMember(${groupId}, ${targetUid}): ${error.message}`);
  revalidateTag(GROUP_DISCOVERY_TAG, "max"); // member count changed
}

export type GroupBan = { userId: string; displayName: string | null; username: string | null; reason: string | null; createdAt: string };

export async function listBans(groupId: string, uid: string): Promise<GroupBan[]> {
  await requireAdmin(groupId, uid);
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("group_bans").select("user_id, reason, created_at").eq("group_id", groupId).order("created_at", { ascending: false }));
  if (error) throw new Error(`listBans(${groupId}): ${error.message}`);
  if (!data?.length) return [];
  const profileById = await profilesById(data.map((r) => r.user_id as string));
  return data.map((r) => ({
    userId: r.user_id as string,
    displayName: profileById.get(r.user_id as string)?.display_name ?? null,
    username: profileById.get(r.user_id as string)?.username ?? null,
    reason: (r.reason as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function unbanMember(groupId: string, actingUid: string, targetUid: string): Promise<void> {
  await requireAdmin(groupId, actingUid);
  const { error } = await supabaseAdmin.from("group_bans").delete().eq("group_id", groupId).eq("user_id", targetUid);
  if (error) throw new Error(`unbanMember(${groupId}, ${targetUid}): ${error.message}`);
}

export async function deleteGroup(groupId: string, uid: string): Promise<void> {
  await requireAdmin(groupId, uid);
  // `on delete cascade` on every group_* table's group_id FK (schema.sql) handles members,
  // scores, predictions/entries, posts/votes/comments in one statement - nothing else to clean up.
  const { error } = await supabaseAdmin.from("groups").delete().eq("id", groupId);
  if (error) throw new Error(`deleteGroup(${groupId}): ${error.message}`);
  revalidateTag(GROUP_DISCOVERY_TAG, "max");
}

const MAX_INVITE_EMAILS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------------- invitations
// A private or hidden community is joined by approval or by a signed, expiring, revocable
// invitation (20260930_group_access.sql, src/lib/inviteTokens.ts). The database row decides whether
// an invitation is still usable; the token proves it was issued by us for this community.

const INVITE_DEFAULT_DAYS = 7;
const INVITE_MAX_DAYS = 30;
const INVITE_DEFAULT_USES = 10;
const INVITE_MAX_USES = 100;
/** A ceiling on live invitations per community, so a member with invite rights can't grow the table
 * without bound. */
const INVITE_MAX_ACTIVE_PER_GROUP = 200;
/** Per-user ceiling on invitations created (links and per-recipient email invites) in the last hour,
 * across every community - an interim abuse limit until durable rate limiting (roadmap R-14). */
const INVITE_MAX_PER_USER_PER_HOUR = 50;

export type GroupInvite = {
  id: string;
  /** The signed token (the shareable link is `/groups/<groupId>?invite=<token>`) - only for the member
   * who created the invitation. Anyone else with invite rights sees it listed but gets null, so they
   * can't copy a working link to, for example, a single-use invitation emailed to a specific person. */
  token: string | null;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  createdBy: string;
  creatorName: string | null;
};

async function requireInviteRights(groupId: string, uid: string): Promise<GroupRole> {
  const role = await requireMember(groupId, uid);
  const { data, error } = await supabaseAdmin.from("groups").select("permissions").eq("id", groupId).maybeSingle();
  if (error) throw new Error(`requireInviteRights(${groupId}): ${error.message}`);
  if (!canDo(data?.permissions, "invite", role)) throw new ServiceError("Only certain roles can invite people to this community.", 403);
  return role;
}

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(min, n));
};

/** Whole seconds, so the timestamp stored in the row and the one signed into the token are equal. */
const expiryFromNow = (days: number): Date => new Date(Math.floor(Date.now() / 1000) * 1000 + days * 86_400_000);

async function assertInviteCapacity(groupId: string, uid: string, adding: number): Promise<void> {
  const { count, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_invites").select("id", { count: "exact", head: true }).eq("group_id", groupId).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
  );
  if (error) throw new Error(`assertInviteCapacity(${groupId}): ${error.message}`);
  if ((count ?? 0) + adding > INVITE_MAX_ACTIVE_PER_GROUP) {
    throw new ServiceError("This community has too many active invitations. Cancel some before creating more.", 409, "invite_limit");
  }
  // Not atomic (two simultaneous requests can both pass the count); an abuse limit, not an accounting
  // rule, so a small overshoot is acceptable.
  const { count: recent, error: recentError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_invites").select("id", { count: "exact", head: true }).eq("created_by", uid).gt("created_at", new Date(Date.now() - 3_600_000).toISOString()),
  );
  if (recentError) throw new Error(`assertInviteCapacity(${groupId}): ${recentError.message}`);
  if ((recent ?? 0) + adding > INVITE_MAX_PER_USER_PER_HOUR) {
    throw new ServiceError("You've created a lot of invitations in the last hour. Try again later.", 429, "invite_rate_limited");
  }
}

async function insertInvite(groupId: string, uid: string, expiresAt: Date, maxUses: number): Promise<{ id: string; token: string }> {
  const { data, error } = await supabaseAdmin
    .from("group_invites")
    .insert({ group_id: groupId, created_by: uid, expires_at: expiresAt.toISOString(), max_uses: maxUses })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error(`insertInvite(${groupId}): no row returned`);
  const id = data.id as string;
  return { id, token: signInviteToken({ inviteId: id, groupId, expiresAt }) };
}

/** A shareable invitation link for a private/hidden community. Defaults: 7 days, 10 uses. */
export async function createGroupInvite(groupId: string, uid: string, opts: { expiresInDays?: number; maxUses?: number } = {}): Promise<{ id: string; token: string; expiresAt: string; maxUses: number }> {
  await requireInviteRights(groupId, uid);
  const days = clampInt(opts.expiresInDays, INVITE_DEFAULT_DAYS, 1, INVITE_MAX_DAYS);
  const maxUses = clampInt(opts.maxUses, INVITE_DEFAULT_USES, 1, INVITE_MAX_USES);
  await assertInviteCapacity(groupId, uid, 1);
  const expiresAt = expiryFromNow(days);
  const { id, token } = await insertInvite(groupId, uid, expiresAt, maxUses);
  return { id, token, expiresAt: expiresAt.toISOString(), maxUses };
}

/** Live invitations (not cancelled, not expired, uses remaining) for people who may invite. */
export async function listGroupInvites(groupId: string, uid: string): Promise<GroupInvite[]> {
  await requireInviteRights(groupId, uid);
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin
      .from("group_invites")
      .select("id, created_by, expires_at, max_uses, use_count, created_at")
      .eq("group_id", groupId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100),
  );
  if (error) throw new Error(`listGroupInvites(${groupId}): ${error.message}`);
  const live = (data ?? []).filter((r) => (r.use_count as number) < (r.max_uses as number));
  if (!live.length) return [];
  const profileById = await profilesById([...new Set(live.map((r) => r.created_by as string))]);
  return live.map((r) => ({
    id: r.id as string,
    token: r.created_by === uid ? signInviteToken({ inviteId: r.id as string, groupId, expiresAt: new Date(r.expires_at as string) }) : null,
    expiresAt: r.expires_at as string,
    maxUses: r.max_uses as number,
    useCount: r.use_count as number,
    createdAt: r.created_at as string,
    createdBy: r.created_by as string,
    creatorName: profileById.get(r.created_by as string)?.display_name ?? null,
  }));
}

/** Cancels an invitation. Takes effect immediately: the next redemption attempt is refused. Admins
 * and moderators can cancel any invitation; anyone else only their own. Idempotent. */
export async function revokeGroupInvite(groupId: string, uid: string, inviteId: string): Promise<void> {
  const role = await requireMember(groupId, uid);
  const { data: invite, error } = await queryWithRetry(() => supabaseAdmin.from("group_invites").select("id, created_by, revoked_at").eq("id", inviteId).eq("group_id", groupId).maybeSingle());
  if (error) throw new Error(`revokeGroupInvite(${groupId}): ${error.message}`);
  if (!invite) throw new ServiceError("That invitation doesn't exist.", 404);
  if (role === "member" && invite.created_by !== uid) throw new ServiceError("You can only cancel invitations you created.", 403);
  if (invite.revoked_at) return;
  const { error: updateError } = await supabaseAdmin.from("group_invites").update({ revoked_at: new Date().toISOString(), revoked_by: uid }).eq("id", inviteId).eq("group_id", groupId).is("revoked_at", null);
  if (updateError) throw new Error(`revokeGroupInvite(${groupId}): ${updateError.message}`);
}

export type InviteState = "valid" | "invalid" | "expired" | "revoked" | "exhausted";

/** What a token presented for this community would do right now, WITHOUT using it - so the page a
 * non-member lands on can say "this invitation has expired" instead of offering a Join that fails.
 * Redemption re-checks everything atomically; this is for messaging only. */
export async function inspectInvite(groupId: string, token: string | null | undefined): Promise<InviteState | null> {
  if (!token) return null;
  const check = verifyInviteToken(token, groupId);
  if (!check.ok) return check.reason === "expired" ? "expired" : "invalid";
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("group_invites").select("expires_at, max_uses, use_count, revoked_at").eq("id", check.inviteId).eq("group_id", groupId).maybeSingle());
  if (error) throw new Error(`inspectInvite(${groupId}): ${error.message}`);
  if (!data) return "invalid";
  if (data.revoked_at) return "revoked";
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return "expired";
  if ((data.use_count as number) >= (data.max_uses as number)) return "exhausted";
  return "valid";
}

/** Emails an invitation to each address. A public community gets its plain link; a private or hidden
 * one gets a per-recipient, single-use, 7-day signed invitation, so a forwarded email can't be used
 * by a second person and each can be cancelled from Manage. */
export async function inviteByEmail(groupId: string, uid: string, emails: string[], origin: string): Promise<{ sent: number }> {
  await requireInviteRights(groupId, uid);
  const cleaned = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) throw new ServiceError("Add at least one email address.", 400);
  if (cleaned.length > MAX_INVITE_EMAILS) throw new ServiceError(`Invite up to ${MAX_INVITE_EMAILS} people at a time.`, 400);
  const invalid = cleaned.find((e) => !EMAIL_RE.test(e));
  if (invalid) throw new ServiceError(`"${invalid}" isn't a valid email address.`, 400);

  const { data: group } = await supabaseAdmin.from("groups").select("name, visibility").eq("id", groupId).maybeSingle();
  const groupName = (group?.name as string | undefined) ?? "an F1 Hub group";
  const needsToken = (group?.visibility as string | undefined) !== "public";
  const inviterName = (await profilesById([uid])).get(uid)?.display_name ?? "A member";
  // APP_BASE_URL when configured, else the origin of the request (see trustedOrigin).
  const baseLink = `${trustedOrigin(origin)}/groups/${groupId}`;

  // Names are user-controlled: escape for the HTML body, and strip control characters for the
  // subject header (audit SEC-11).
  const safeGroup = escapeHtml(groupName);
  const safeInviter = escapeHtml(inviterName);
  const subjectGroup = singleLine(groupName);
  const subjectInviter = singleLine(inviterName);

  if (needsToken) await assertInviteCapacity(groupId, uid, cleaned.length);
  const expiresAt = expiryFromNow(INVITE_DEFAULT_DAYS);
  const transporter = getTransporter();
  await Promise.all(
    cleaned.map(async (to) => {
      const link = needsToken ? `${baseLink}?invite=${(await insertInvite(groupId, uid, expiresAt, 1)).token}` : baseLink;
      await transporter.sendMail({
        from: `"Apex F1 Hub" <${process.env.MAIL_FROM}>`,
        to,
        subject: `${subjectInviter} invited you to join ${subjectGroup} on F1 Hub`,
        text: `${inviterName} invited you to join "${groupName}" on F1 Hub - a prediction league and F1 community. Join here: ${link}`,
        html: `<p>${safeInviter} invited you to join <strong>${safeGroup}</strong> on F1 Hub - a prediction league and F1 community.</p><p><a href="${escapeHtml(link)}">Join ${safeGroup}</a></p>`,
      });
    }),
  );
  return { sent: cleaned.length };
}

// ============================================================= join requests

export type JoinRequestStatus = "pending" | "approved" | "rejected";

export type JoinRequest = {
  userId: string;
  displayName: string | null;
  username: string | null;
  message: string | null;
  status: JoinRequestStatus;
  createdAt: string;
};

/** What the current user's relationship to a community they're NOT in looks like - drives whether
 * the page offers "Join", "Request to Join", or "Requested". */
export async function getMyJoinRequest(groupId: string, uid: string): Promise<{ status: JoinRequestStatus } | null> {
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_join_requests").select("status").eq("group_id", groupId).eq("user_id", uid).maybeSingle(),
  );
  if (error) throw new Error(`getMyJoinRequest(${groupId}): ${error.message}`);
  return data ? { status: data.status as JoinRequestStatus } : null;
}

const MAX_JOIN_MESSAGE = 500;

/** Ask to join a private community. Public communities never route through here (joinGroup is
 * immediate), and hidden ones can't be reached without an invite in the first place.
 *
 * Upserts rather than inserts: re-requesting after a rejection should reopen the same row, not
 * stack a second one - the primary key on (group_id, user_id) makes duplicates structurally
 * impossible anyway.
 */
export async function requestToJoin(groupId: string, uid: string, message?: string): Promise<{ status: JoinRequestStatus }> {
  const { data: group, error: groupError } = await supabaseAdmin.from("groups").select("visibility").eq("id", groupId).maybeSingle();
  if (groupError) throw new Error(`requestToJoin(${groupId}): ${groupError.message}`);
  if (!group) throw new ServiceError("That community doesn't exist.", 404);
  if (group.visibility === "public") throw new ServiceError("This community is public - you can join it directly.", 400);

  const existingRole = await getMemberRole(groupId, uid);
  if (existingRole) throw new ServiceError("You're already a member.", 400);
  if (await isBanned(groupId, uid)) throw new ServiceError("You can't join this community.", 403, "banned");

  const trimmed = message?.trim().slice(0, MAX_JOIN_MESSAGE) || null;
  const { error } = await supabaseAdmin
    .from("group_join_requests")
    .upsert({ group_id: groupId, user_id: uid, message: trimmed, status: "pending", decided_at: null, decided_by: null }, { onConflict: "group_id,user_id" });
  if (error) throw new Error(`requestToJoin(${groupId}): ${error.message}`);
  return { status: "pending" };
}

export async function cancelJoinRequest(groupId: string, uid: string): Promise<void> {
  const { error } = await supabaseAdmin.from("group_join_requests").delete().eq("group_id", groupId).eq("user_id", uid);
  if (error) throw new Error(`cancelJoinRequest(${groupId}): ${error.message}`);
}

/** Pending requests for a community's admins/moderators to act on. */
export async function listJoinRequests(groupId: string, uid: string): Promise<JoinRequest[]> {
  const role = await requireMember(groupId, uid);
  if (role === "member") throw new ServiceError("Only admins and moderators can see join requests.", 403);

  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_join_requests").select("user_id, message, status, created_at").eq("group_id", groupId).eq("status", "pending").order("created_at"),
  );
  if (error) throw new Error(`listJoinRequests(${groupId}): ${error.message}`);
  if (!data?.length) return [];

  const profileById = await profilesById(data.map((r) => r.user_id as string));
  return data.map((r) => ({
    userId: r.user_id as string,
    displayName: profileById.get(r.user_id as string)?.display_name ?? null,
    username: profileById.get(r.user_id as string)?.username ?? null,
    message: (r.message as string | null) ?? null,
    status: r.status as JoinRequestStatus,
    createdAt: r.created_at as string,
  }));
}

/** Approve or reject. Approval adds the real membership row in the same call - a request marked
 * approved that didn't actually let the person in would be the worst of both states. */
export async function decideJoinRequest(groupId: string, actingUid: string, targetUid: string, decision: "approve" | "reject"): Promise<void> {
  const role = await requireMember(groupId, actingUid);
  if (role === "member") throw new ServiceError("Only admins and moderators can decide join requests.", 403);

  const { data: request, error: requestError } = await supabaseAdmin
    .from("group_join_requests")
    .select("status")
    .eq("group_id", groupId)
    .eq("user_id", targetUid)
    .maybeSingle();
  if (requestError) throw new Error(`decideJoinRequest(${groupId}): ${requestError.message}`);
  if (!request) throw new ServiceError("That request no longer exists.", 404);
  // Only a pending request can be decided. Approving an already-rejected one would quietly reopen a
  // decision another admin made; the member can simply ask again (requestToJoin re-opens the row).
  if (request.status !== "pending") throw new ServiceError("That request has already been decided.", 409);

  if (decision === "approve") {
    if (await isBanned(groupId, targetUid)) throw new ServiceError("That person is banned from this community. Unban them first.", 409, "banned");
    // Membership first: if this insert fails the request stays pending and can be retried, which is
    // recoverable. Marking it approved first and then failing to add them is not.
    const alreadyMember = await getMemberRole(groupId, targetUid);
    if (!alreadyMember) {
      const { error } = await supabaseAdmin.from("group_members").insert({ group_id: groupId, user_id: targetUid, role: "member" });
      if (error) throw error;
    }
    revalidateTag(GROUP_DISCOVERY_TAG, "max"); // member count changed
  }

  const { error } = await supabaseAdmin
    .from("group_join_requests")
    .update({ status: decision === "approve" ? "approved" : "rejected", decided_at: new Date().toISOString(), decided_by: actingUid })
    .eq("group_id", groupId)
    .eq("user_id", targetUid);
  if (error) throw new Error(`decideJoinRequest(${groupId}): ${error.message}`);
}

export async function countPendingJoinRequests(groupId: string): Promise<number> {
  const { count, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_join_requests").select("user_id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "pending"),
  );
  if (error) throw new Error(`countPendingJoinRequests(${groupId}): ${error.message}`);
  return count ?? 0;
}

/** Leave a community you're in. Distinct from removeMember, which is an admin action and requires
 * admin - until now there was no code path at all by which an ordinary member could leave.
 *
 * Two guards, both about not orphaning the community:
 *  - the last admin can't walk out on a community that still has other members (someone has to be
 *    able to administer it); promote someone first
 *  - the last member full stop is told to delete it instead, because a community with zero members
 *    is unreachable by anyone afterwards, including them
 */
export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const role = await requireMember(groupId, uid);

  const { count, error: countError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", groupId),
  );
  if (countError) throw new Error(`leaveGroup(${groupId}): ${countError.message}`);
  const memberCount = count ?? 0;

  if (memberCount <= 1) {
    throw new ServiceError("You're the only member. Delete the community instead.", 400);
  }
  if (role === "admin" && (await countAdmins(groupId)) <= 1) {
    throw new ServiceError("You're the only admin. Promote someone else before leaving.", 400);
  }

  const { error } = await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", uid);
  if (error) throw new Error(`leaveGroup(${groupId}): ${error.message}`);
  revalidateTag(GROUP_DISCOVERY_TAG, "max"); // member count changed
}
