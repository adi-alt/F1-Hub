import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/supabase/groups";

/**
 * One community's own numbers, and its own "since you were last here".
 *
 * Separate from communityPulse.ts on purpose: that file answers "what changed across ALL the
 * communities you belong to" and is keyed by `profiles.last_communities_visit_at`. This one answers
 * the same question about ONE community and is keyed by `group_members.last_visit_at`. Sharing
 * either marker between the two surfaces would mean opening one silently resets the other's digest
 * - the exact trap the homepage's own last_homepage_visit_at comment already warns about.
 */

export type GroupStats = {
  members: number;
  /** Published posts, all time. Pending/rejected/scheduled rows aren't posts anyone can read. */
  posts: number;
  /** Published posts in the last 7 days. */
  weeklyPosts: number;
  /** Published posts in the 7 days BEFORE that - what `weeklyPosts` is a change against. */
  previousWeeklyPosts: number;
  /** Distinct members who posted or commented in the last 7 days. A real activity figure, and a
   * different thing from the live presence count the page shows beside it. */
  activeMembers: number;
};

export type GroupPulse = {
  /** False when this member has never opened this community's page since the marker existed. The
   * widget then shows the standing picture instead of a diff, because there is genuinely no prior
   * visit to diff against. */
  hasPriorVisit: boolean;
  since: string | null;
  /** Other people's posts since the last visit - a digest that counted your own would be telling
   * you about yourself. */
  newPosts: number;
  /** Replies from other people on YOUR posts in this community. */
  repliesToYou: number;
  /** New entries on this community's open prediction rounds. */
  newPredictionEntries: number;
  /** Members who joined since the last visit. */
  newMembers: number;
};

const EMPTY_PULSE: GroupPulse = {
  hasPriorVisit: false,
  since: null,
  newPosts: 0,
  repliesToYou: 0,
  newPredictionEntries: 0,
  newMembers: 0,
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** `head: true` + `count: "exact"` - a real COUNT(*) in the database, not rows fetched and
 * measured here. */
async function countRows(build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>, label: string): Promise<number> {
  const { count, error } = await queryWithRetry(build);
  if (error) throw new Error(`${label}: ${error.message}`);
  return count ?? 0;
}

/**
 * The Community Stats widget's numbers. Membership-gated like every other read in this file's
 * neighbours: a community's post volume is not public information.
 */
export async function getGroupStats(groupId: string, uid: string): Promise<GroupStats> {
  await requireMember(groupId, uid);

  const now = Date.now();
  const weekAgo = new Date(now - WEEK_MS).toISOString();
  const twoWeeksAgo = new Date(now - 2 * WEEK_MS).toISOString();

  const [members, posts, weeklyPosts, previousWeeklyPosts, activeMembers] = await Promise.all([
    countRows(() => supabaseAdmin.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", groupId), `getGroupStats(${groupId}) members`),
    countRows(
      () => supabaseAdmin.from("group_posts").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "published"),
      `getGroupStats(${groupId}) posts`,
    ),
    countRows(
      () => supabaseAdmin.from("group_posts").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "published").gte("created_at", weekAgo),
      `getGroupStats(${groupId}) weeklyPosts`,
    ),
    countRows(
      () =>
        supabaseAdmin
          .from("group_posts")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("status", "published")
          .gte("created_at", twoWeeksAgo)
          .lt("created_at", weekAgo),
      `getGroupStats(${groupId}) previousWeeklyPosts`,
    ),
    countActiveMembers(groupId, weekAgo),
  ]);

  return { members, posts, weeklyPosts, previousWeeklyPosts, activeMembers };
}

/** Distinct people who posted or commented here in the window. Comments carry no group_id of their
 * own, so they're reached through this community's own post ids - which is also what keeps the
 * figure to this community rather than the commenter's activity everywhere. */
async function countActiveMembers(groupId: string, since: string): Promise<number> {
  const [{ data: posters, error: postersError }, { data: postIds, error: postIdsError }] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_posts").select("user_id").eq("group_id", groupId).eq("status", "published").gte("created_at", since)),
    queryWithRetry(() => supabaseAdmin.from("group_posts").select("id").eq("group_id", groupId)),
  ]);
  if (postersError) throw new Error(`countActiveMembers(${groupId}): ${postersError.message}`);
  if (postIdsError) throw new Error(`countActiveMembers(${groupId}): ${postIdsError.message}`);

  const active = new Set((posters ?? []).map((p) => p.user_id as string));
  const ids = (postIds ?? []).map((p) => p.id as string);
  if (ids.length > 0) {
    const { data: commenters, error: commentersError } = await queryWithRetry(() =>
      supabaseAdmin.from("group_post_comments").select("user_id").in("post_id", ids).gte("created_at", since),
    );
    if (commentersError) throw new Error(`countActiveMembers(${groupId}): ${commentersError.message}`);
    for (const c of commenters ?? []) active.add(c.user_id as string);
  }
  return active.size;
}

/**
 * Reads this member's last visit to THIS community and stamps a new one - so, like its
 * cross-community counterpart, it must run exactly once per page load, from the server component,
 * never from a client component that could re-run and collapse the window.
 *
 * Degrades to the first-visit shape on any failure (including a deploy where the migration adding
 * `group_members.last_visit_at` hasn't been applied yet): this is context beside the feed and must
 * not be able to take the community page down with it.
 */
export async function getGroupPulse(groupId: string, uid: string): Promise<GroupPulse> {
  try {
    const { data: membership, error: membershipError } = await queryWithRetry(() =>
      supabaseAdmin.from("group_members").select("last_visit_at").eq("group_id", groupId).eq("user_id", uid).maybeSingle(),
    );
    if (membershipError) throw new Error(membershipError.message);

    const since = (membership?.last_visit_at as string | null) ?? null;

    // Stamped regardless of what the diff below finds, so a page load always advances the window -
    // otherwise an error in one count would make the next visit re-report the same items.
    void supabaseAdmin
      .from("group_members")
      .update({ last_visit_at: new Date().toISOString() })
      .eq("group_id", groupId)
      .eq("user_id", uid)
      .then(() => undefined);

    if (since === null) return { ...EMPTY_PULSE, hasPriorVisit: false, since: null };

    const { data: myPostRows, error: myPostsError } = await queryWithRetry(() =>
      supabaseAdmin.from("group_posts").select("id").eq("group_id", groupId).eq("user_id", uid),
    );
    if (myPostsError) throw new Error(myPostsError.message);
    const myPostIds = (myPostRows ?? []).map((p) => p.id as string);

    const { data: openPredictionRows, error: predictionsError } = await queryWithRetry(() =>
      supabaseAdmin.from("group_predictions").select("id").eq("group_id", groupId).eq("status", "open"),
    );
    if (predictionsError) throw new Error(predictionsError.message);
    const openPredictionIds = (openPredictionRows ?? []).map((p) => p.id as string);

    const [newPosts, repliesToYou, newPredictionEntries, newMembers] = await Promise.all([
      countRows(
        () =>
          supabaseAdmin
            .from("group_posts")
            .select("id", { count: "exact", head: true })
            .eq("group_id", groupId)
            .eq("status", "published")
            .neq("user_id", uid)
            .gt("created_at", since),
        `getGroupPulse(${groupId}) newPosts`,
      ),
      myPostIds.length > 0
        ? countRows(
            () => supabaseAdmin.from("group_post_comments").select("id", { count: "exact", head: true }).in("post_id", myPostIds).neq("user_id", uid).gt("created_at", since),
            `getGroupPulse(${groupId}) repliesToYou`,
          )
        : Promise.resolve(0),
      openPredictionIds.length > 0
        ? countRows(
            () => supabaseAdmin.from("group_prediction_entries").select("prediction_id", { count: "exact", head: true }).in("prediction_id", openPredictionIds).gt("created_at", since),
            `getGroupPulse(${groupId}) newPredictionEntries`,
          )
        : Promise.resolve(0),
      countRows(
        () => supabaseAdmin.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", groupId).gt("joined_at", since),
        `getGroupPulse(${groupId}) newMembers`,
      ),
    ]);

    return { hasPriorVisit: true, since, newPosts, repliesToYou, newPredictionEntries, newMembers };
  } catch {
    return EMPTY_PULSE;
  }
}
