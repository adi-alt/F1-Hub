import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";

export type ModerationAction = "post_approved" | "post_removed" | "comment_removed" | "report_dismissed";

export type ModerationLogEntry = {
  id: string;
  action: ModerationAction;
  actorId: string | null;
  actorName: string;
  postId: string | null;
  commentId: string | null;
  targetUserId: string | null;
  targetName: string | null;
  excerpt: string | null;
  createdAt: string;
};

/** Records one moderator decision (20261028_post_moderation.sql). A failure here is logged, never thrown: the
 * decision itself has already been saved, and refusing it after the fact would only confuse the moderator. */
export async function logModeration(entry: {
  groupId: string;
  actorId: string;
  action: ModerationAction;
  postId?: string | null;
  commentId?: string | null;
  reportId?: string | null;
  targetUserId?: string | null;
  excerpt?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("group_moderation_log").insert({
    group_id: entry.groupId,
    actor_id: entry.actorId,
    action: entry.action,
    post_id: entry.postId ?? null,
    comment_id: entry.commentId ?? null,
    report_id: entry.reportId ?? null,
    target_user_id: entry.targetUserId ?? null,
    excerpt: entry.excerpt ? entry.excerpt.slice(0, 200) : null,
  });
  if (error) console.error(`logModeration(${entry.groupId}, ${entry.action}): ${error.message}`);
}

/** The newest decisions in one community, newest first. The caller has already checked the reader moderates it. */
export async function readModerationLog(groupId: string, limit = 50): Promise<ModerationLogEntry[]> {
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_moderation_log").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(limit),
  );
  if (error) throw new Error(`readModerationLog(${groupId}): ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.flatMap((r) => [r.actor_id, r.target_user_id]).filter((id): id is string => typeof id === "string"))];
  const names = await displayNames(ids);
  return rows.map((r) => ({
    id: r.id as string,
    action: r.action as ModerationAction,
    actorId: (r.actor_id as string | null) ?? null,
    actorName: r.actor_id ? (names.get(r.actor_id as string) ?? "A moderator") : "A former moderator",
    postId: (r.post_id as string | null) ?? null,
    commentId: (r.comment_id as string | null) ?? null,
    targetUserId: (r.target_user_id as string | null) ?? null,
    targetName: r.target_user_id ? (names.get(r.target_user_id as string) ?? null) : null,
    excerpt: (r.excerpt as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await queryWithRetry(() => supabaseAdmin.from("profiles").select("id, display_name, username").in("id", userIds));
  if (error) throw new Error(`displayNames: ${error.message}`);
  return new Map(
    (data ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? (p.username as string | null) ?? `User ${(p.id as string).slice(0, 6)}`]),
  );
}
