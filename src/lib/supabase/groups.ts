import { unstable_cache, revalidateTag } from "next/cache";
import {
  isCommunityType,
  isVisibility,
  normalizeTags,
  normalizeTopic,
  type CommunityFeatures,
  type CommunityType,
  type CommunityVisibility,
} from "@/lib/communities";
import { getTransporter } from "@/lib/otp";
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
  };
}

/** The columns communityShapeOf() needs, appended to an explicit `select(...)` list. */
const COMMUNITY_SHAPE_COLUMNS = "community_type, topic, tags, features";

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

/** Public groups only, opted-in via `visibility = 'public'` - the one deliberate relaxation of
 * "nothing is discoverable without an invite link" (see groups' own RLS comment in schema.sql).
 * `query` matches name/description, case-insensitively - good enough for a groups directory this
 * app expects to have dozens, not millions, of rows in. Not id - the search box no longer
 * advertises that (plain "Search public F1 communities..."), and an unconditional `id.eq.<text>`
 * clause 500s the whole request the moment someone types a term that isn't a valid uuid. */
export const listPublicGroups = unstable_cache(
  async (query?: string, uid?: string): Promise<PublicGroupSummary[]> => listPublicGroupsUncached(query, uid),
  ["list-public-groups"],
  { revalidate: GROUP_DISCOVERY_REVALIDATE_SECONDS, tags: [GROUP_DISCOVERY_TAG] },
);

async function listPublicGroupsUncached(query?: string, uid?: string): Promise<PublicGroupSummary[]> {
  let builder = supabaseAdmin.from("groups").select(`id, name, description, avatar_url, banner_url, created_at, ${COMMUNITY_SHAPE_COLUMNS}`).eq("visibility", "public");
  const trimmed = query?.trim();
  if (trimmed) builder = builder.or(`name.ilike.%${trimmed}%,description.ilike.%${trimmed}%`);
  const { data: groups, error } = await queryWithRetry(() => builder.order("created_at", { ascending: false }));
  if (error) throw new Error(`listPublicGroups: ${error.message}`);
  if (!groups?.length) return [];

  const groupIds = groups.map((g) => g.id as string);
  const [{ data: allMembers, error: membersError }, { data: predictions, error: predictionsError }, activitySignals, myMemberships] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").in("group_id", groupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_predictions").select("group_id").in("group_id", groupIds).eq("status", "open")),
    groupActivitySignals(groupIds),
    uid
      ? queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid).in("group_id", groupIds))
      : Promise.resolve({ data: [] as { group_id: string }[], error: null }),
  ]);
  if (membersError) throw new Error(`listPublicGroups: ${membersError.message}`);
  if (predictionsError) throw new Error(`listPublicGroups: ${predictionsError.message}`);
  if (myMemberships.error) throw new Error(`listPublicGroups: ${myMemberships.error.message}`);
  const memberCounts = new Map<string, number>();
  for (const m of allMembers ?? []) memberCounts.set(m.group_id as string, (memberCounts.get(m.group_id as string) ?? 0) + 1);
  const activePredictionCounts = new Map<string, number>();
  for (const p of predictions ?? []) activePredictionCounts.set(p.group_id as string, (activePredictionCounts.get(p.group_id as string) ?? 0) + 1);
  const myGroupIds = new Set((myMemberships.data ?? []).map((m) => m.group_id as string));

  return groups.map((g) => {
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
}

/** Enough to decide "do I want to join this" without being a member yet — the whole point of an
 * invite link. The link itself (the group's own uuid) is the access control for a private group;
 * nothing here is discoverable without already having it unless the group opted into
 * visibility='public' (see listPublicGroups above). */
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

export async function joinGroup(uid: string, groupId: string): Promise<{ id: string; name: string }> {
  const { data: group } = await supabaseAdmin.from("groups").select("id, name").eq("id", groupId).maybeSingle();
  if (!group) throw new ServiceError("That invite link isn't valid.", 404);

  const existingRole = await getMemberRole(groupId, uid);
  if (!existingRole) {
    const { error } = await supabaseAdmin.from("group_members").insert({ group_id: groupId, user_id: uid, role: "member" });
    if (error) throw error;
    revalidateTag(GROUP_DISCOVERY_TAG, "max"); // member count / isMember changed
  }
  return { id: group.id as string, name: group.name as string };
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
    visibility?: GroupVisibility;
    moderationEnabled?: boolean;
    communityType?: CommunityType;
    topic?: string | null;
    tags?: string[];
    features?: CommunityFeatures;
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

export async function removeMember(groupId: string, actingUid: string, targetUid: string): Promise<void> {
  await requireAdmin(groupId, actingUid);
  const targetRole = await getMemberRole(groupId, targetUid);
  if (!targetRole) return; // already not a member - removing is idempotent

  if (targetRole === "admin" && (await countAdmins(groupId)) <= 1) {
    throw new ServiceError("A group needs at least one admin - promote someone else before removing yourself.", 400);
  }

  const { error } = await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", targetUid);
  if (error) throw new Error(`removeMember(${groupId}, ${targetUid}): ${error.message}`);
  revalidateTag(GROUP_DISCOVERY_TAG, "max"); // member count changed
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

/** Sends a plain "you've been invited" email per address, reusing the same SMTP transporter
 * otp.ts already sends verification codes through - no new invite-token table, since the link
 * inside the email is the exact same group URL InviteLink.tsx already renders for copy/paste (the
 * group's own uuid is the whole access control, see schema.sql's own comment on why). This is
 * automating delivery of that same link, not a new invitation entity with its own pending state. */
export async function inviteByEmail(groupId: string, uid: string, emails: string[], origin: string): Promise<{ sent: number }> {
  const role = await requireMember(groupId, uid);
  if (role === "member") throw new ServiceError("Only a group admin or moderator can send invites.", 403);

  const cleaned = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) throw new ServiceError("Add at least one email address.", 400);
  if (cleaned.length > MAX_INVITE_EMAILS) throw new ServiceError(`Invite up to ${MAX_INVITE_EMAILS} people at a time.`, 400);
  const invalid = cleaned.find((e) => !EMAIL_RE.test(e));
  if (invalid) throw new ServiceError(`"${invalid}" isn't a valid email address.`, 400);

  const { data: group } = await supabaseAdmin.from("groups").select("name").eq("id", groupId).maybeSingle();
  const groupName = (group?.name as string | undefined) ?? "an F1 Hub group";
  const inviterName = (await profilesById([uid])).get(uid)?.display_name ?? "A member";
  // No app-wide base-URL env var exists anywhere in this codebase (confirmed) - InviteLink.tsx's
  // own copy-link button gets the origin from `window.location.origin` client-side; the route
  // handler calling this (server-side, no `window`) derives the same thing from the incoming
  // request's own URL and passes it in, rather than this reaching for a nonexistent env var.
  const link = `${origin}/groups/${groupId}`;

  const transporter = getTransporter();
  await Promise.all(
    cleaned.map((to) =>
      transporter.sendMail({
        from: `"Apex F1 Hub" <${process.env.MAIL_FROM}>`,
        to,
        subject: `${inviterName} invited you to join ${groupName} on F1 Hub`,
        text: `${inviterName} invited you to join "${groupName}" on F1 Hub - a prediction league and F1 community. Join here: ${link}`,
        html: `<p>${inviterName} invited you to join <strong>${groupName}</strong> on F1 Hub - a prediction league and F1 community.</p><p><a href="${link}">Join ${groupName}</a></p>`,
      }),
    ),
  );
  return { sent: cleaned.length };
}
