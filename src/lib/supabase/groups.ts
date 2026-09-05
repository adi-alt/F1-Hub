import { getTransporter } from "@/lib/otp";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { ServiceError } from "@/services/errors";

export type GroupRole = "admin" | "moderator" | "member";
export type GroupVisibility = "public" | "private";
export type PickSlotResult = "exact" | "podium" | "miss";

// A group card's own "why should I click this right now" signals - all real, all derived straight
// from group_posts/group_predictions, never a fabricated count or label.
export type LatestPost = { authorName: string; createdAt: string; content: string };

export type GroupSummary = {
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

export type GroupPreview = { id: string; name: string; description: string | null; avatarUrl: string | null; bannerUrl: string | null; memberCount: number; visibility: GroupVisibility };

export type PublicGroupSummary = {
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

export type GroupDetail = {
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
    queryWithRetry(() => supabaseAdmin.from("groups").select("id, name, description, avatar_url, banner_url, visibility, created_at").in("id", groupIds)),
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
export async function listPublicGroups(query?: string, uid?: string): Promise<PublicGroupSummary[]> {
  let builder = supabaseAdmin.from("groups").select("id, name, description, avatar_url, banner_url, created_at").eq("visibility", "public");
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
export async function getGroupPreview(groupId: string): Promise<GroupPreview | null> {
  const { data: group, error: groupError } = await queryWithRetry(() =>
    supabaseAdmin.from("groups").select("id, name, description, avatar_url, banner_url, visibility").eq("id", groupId).maybeSingle(),
  );
  if (groupError) throw new Error(`getGroupPreview(${groupId}): ${groupError.message}`);
  if (!group) return null;
  const { count, error: countError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", groupId),
  );
  if (countError) throw new Error(`getGroupPreview(${groupId}): ${countError.message}`);
  return {
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
  input: { name: string; description?: string; visibility?: GroupVisibility; moderationEnabled?: boolean },
): Promise<{ id: string }> {
  const trimmed = input.name.trim();
  if (trimmed.length < 3 || trimmed.length > 40) {
    throw new ServiceError("Group name must be 3-40 characters.", 400);
  }
  const description = input.description?.trim() || null;
  if (description && description.length > 280) throw new ServiceError("Description must be 280 characters or fewer.", 400);
  const visibility: GroupVisibility = input.visibility === "public" ? "public" : "private";

  const { data, error } = await supabaseAdmin
    .from("groups")
    .insert({ name: trimmed, description, visibility, created_by: uid, moderation_enabled: !!input.moderationEnabled })
    .select("id")
    .single();
  if (error && isDuplicateNameError(error)) throw new ServiceError("A group with this name already exists.", 409);
  if (error || !data) throw error ?? new ServiceError("Could not create group.", 500);

  // Paired insert, not a transaction — a group with no members is a state nothing else can reach
  // anyway (this is the only code path that creates one), so there's nothing to roll back to if
  // this second insert somehow failed; not worth procedural SQL for one guaranteed-together pair.
  const { error: memberError } = await supabaseAdmin.from("group_members").insert({ group_id: data.id, user_id: uid, role: "admin" });
  if (memberError) throw memberError;

  return { id: data.id as string };
}

export async function joinGroup(uid: string, groupId: string): Promise<{ id: string; name: string }> {
  const { data: group } = await supabaseAdmin.from("groups").select("id, name").eq("id", groupId).maybeSingle();
  if (!group) throw new ServiceError("That invite link isn't valid.", 404);

  const existingRole = await getMemberRole(groupId, uid);
  if (!existingRole) {
    const { error } = await supabaseAdmin.from("group_members").insert({ group_id: groupId, user_id: uid, role: "member" });
    if (error) throw error;
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
}

export async function updateGroupBanner(groupId: string, uid: string, bannerUrl: string): Promise<void> {
  await requireAdmin(groupId, uid);
  await supabaseAdmin.from("groups").update({ banner_url: bannerUrl }).eq("id", groupId);
}

export async function removeGroupBanner(groupId: string, uid: string): Promise<void> {
  await requireAdmin(groupId, uid);
  await supabaseAdmin.from("groups").update({ banner_url: null }).eq("id", groupId);
}

export async function updateGroupSettings(
  groupId: string,
  uid: string,
  updates: { name?: string; description?: string | null; visibility?: GroupVisibility; moderationEnabled?: boolean },
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
  if (updates.visibility !== undefined) patch.visibility = updates.visibility;
  if (updates.moderationEnabled !== undefined) patch.moderation_enabled = updates.moderationEnabled;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabaseAdmin.from("groups").update(patch).eq("id", groupId);
  if (error && isDuplicateNameError(error)) throw new ServiceError("A group with this name already exists.", 409);
  if (error) throw new Error(`updateGroupSettings(${groupId}): ${error.message}`);
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
}

export async function deleteGroup(groupId: string, uid: string): Promise<void> {
  await requireAdmin(groupId, uid);
  // `on delete cascade` on every group_* table's group_id FK (schema.sql) handles members,
  // scores, predictions/entries, posts/votes/comments in one statement - nothing else to clean up.
  const { error } = await supabaseAdmin.from("groups").delete().eq("id", groupId);
  if (error) throw new Error(`deleteGroup(${groupId}): ${error.message}`);
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
