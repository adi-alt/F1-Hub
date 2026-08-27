import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { ServiceError } from "@/services/errors";

export type GroupRole = "admin" | "member";
export type PickSlotResult = "exact" | "podium" | "miss";

export type GroupSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  myRole: GroupRole;
};

export type GroupPreview = { id: string; name: string; avatarUrl: string | null; memberCount: number };

export type GroupMember = {
  userId: string;
  displayName: string | null;
  username: string | null;
  role: GroupRole;
  joinedAt: string;
};

export type GroupDetail = {
  id: string;
  name: string;
  avatarUrl: string | null;
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

type ProfileLite = { id: string; display_name: string | null; username: string | null };

async function profilesById(userIds: string[]): Promise<Map<string, ProfileLite>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("profiles").select("id, display_name, username").in("id", userIds),
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

async function requireMember(groupId: string, uid: string): Promise<GroupRole> {
  const role = await getMemberRole(groupId, uid);
  if (!role) throw new ServiceError("You're not a member of this group.", 403);
  return role;
}

export async function getUserGroups(uid: string): Promise<GroupSummary[]> {
  const { data: memberships, error: membershipsError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("group_id, role").eq("user_id", uid),
  );
  if (membershipsError) throw new Error(`getUserGroups(${uid}): ${membershipsError.message}`);
  if (!memberships?.length) return [];

  const groupIds = memberships.map((m) => m.group_id as string);
  const [{ data: groups, error: groupsError }, { data: allMembers, error: allMembersError }] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("groups").select("id, name, avatar_url").in("id", groupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").in("group_id", groupIds)),
  ]);
  if (groupsError) throw new Error(`getUserGroups(${uid}): ${groupsError.message}`);
  if (allMembersError) throw new Error(`getUserGroups(${uid}): ${allMembersError.message}`);

  const memberCounts = new Map<string, number>();
  for (const m of allMembers ?? []) memberCounts.set(m.group_id as string, (memberCounts.get(m.group_id as string) ?? 0) + 1);
  const roleByGroup = new Map(memberships.map((m) => [m.group_id as string, m.role as GroupRole]));

  return (groups ?? [])
    .map((g) => ({
      id: g.id as string,
      name: g.name as string,
      avatarUrl: (g.avatar_url as string | null) ?? null,
      memberCount: memberCounts.get(g.id as string) ?? 1,
      myRole: roleByGroup.get(g.id as string) ?? "member",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Enough to decide "do I want to join this" without being a member yet — the whole point of an
 * invite link. The link itself (the group's own uuid) is the access control: nothing here is
 * discoverable without already having it, since `groups` has no public listing anywhere. */
export async function getGroupPreview(groupId: string): Promise<GroupPreview | null> {
  const { data: group, error: groupError } = await queryWithRetry(() =>
    supabaseAdmin.from("groups").select("id, name, avatar_url").eq("id", groupId).maybeSingle(),
  );
  if (groupError) throw new Error(`getGroupPreview(${groupId}): ${groupError.message}`);
  if (!group) return null;
  const { count, error: countError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", groupId),
  );
  if (countError) throw new Error(`getGroupPreview(${groupId}): ${countError.message}`);
  return { id: group.id as string, name: group.name as string, avatarUrl: (group.avatar_url as string | null) ?? null, memberCount: count ?? 0 };
}

export async function createGroup(uid: string, name: string): Promise<{ id: string }> {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 40) {
    throw new ServiceError("Group name must be 3-40 characters.", 400);
  }
  const { data, error } = await supabaseAdmin.from("groups").insert({ name: trimmed, created_by: uid }).select("id").single();
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
    avatarUrl: (group.avatar_url as string | null) ?? null,
    createdBy: group.created_by as string,
    createdAt: group.created_at as string,
    myRole,
    members: (members ?? []).map((m) => ({
      userId: m.user_id as string,
      displayName: profileById.get(m.user_id as string)?.display_name ?? null,
      username: profileById.get(m.user_id as string)?.username ?? null,
      role: m.role as GroupRole,
      joinedAt: m.joined_at as string,
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
  const role = await requireMember(groupId, uid);
  if (role !== "admin") throw new ServiceError("Only a group admin can change the avatar.", 403);
  await supabaseAdmin.from("groups").update({ avatar_url: avatarUrl }).eq("id", groupId);
}
