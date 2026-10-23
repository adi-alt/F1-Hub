import { supabaseAdmin } from "@/lib/supabase/admin";
import { listPostMediaObjects } from "@/lib/supabase/postMediaStorage";

/** Every table holding rows a person owns, and the column that says so (audit R-53). The export reads exactly these;
 * deletion removes them through the profile's cascades (supabase/migrations/20261029_account_deletion.sql). */
export const OWNED_TABLES: { table: string; column: string }[] = [
  { table: "picks", column: "user_id" },
  { table: "group_prediction_entries", column: "user_id" },
  { table: "points_transactions", column: "user_id" },
  { table: "notifications", column: "user_id" },
  { table: "group_members", column: "user_id" },
  { table: "group_posts", column: "user_id" },
  { table: "group_post_comments", column: "user_id" },
  { table: "group_post_votes", column: "user_id" },
  { table: "group_comment_votes", column: "user_id" },
  { table: "post_calls", column: "user_id" },
  { table: "group_join_requests", column: "user_id" },
  { table: "group_invites", column: "created_by" },
  { table: "group_invite_redemptions", column: "user_id" },
  { table: "group_bans", column: "user_id" },
  { table: "groups", column: "created_by" },
  { table: "group_predictions", column: "created_by" },
];

const PAGE = 1000;

/** All of one table's rows for this person, a page at a time (PostgREST caps a single response). */
async function ownedRows(table: string, column: string, uid: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin.from(table).select("*").eq(column, uid).range(from, from + PAGE - 1);
    if (error) throw new Error(`exportAccountData(${table}): ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export type AccountExport = {
  exportedAt: string;
  profile: Record<string, unknown> | null;
  tables: Record<string, Record<string, unknown>[]>;
  uploads: { path: string; bytes: number }[];
};

/** Everything a person owns, as JSON (audit R-53): their profile, every row in OWNED_TABLES, and the files they uploaded. */
export async function exportAccountData(uid: string, now = new Date()): Promise<AccountExport> {
  const { data: profile, error } = await supabaseAdmin.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw new Error(`exportAccountData(profiles): ${error.message}`);
  const tables: AccountExport["tables"] = {};
  for (const { table, column } of OWNED_TABLES) tables[table] = await ownedRows(table, column, uid);
  const uploads = (await listPostMediaObjects(uid)).map((o) => ({ path: o.name, bytes: o.size }));
  return { exportedAt: now.toISOString(), profile: (profile as Record<string, unknown> | null) ?? null, tables, uploads };
}

/**
 * Deletes a person's account for good (audit R-53): the database rows first, in one transaction (delete_account:
 * communities they ran are handed on, then the profile and everything cascading from it, posts and comments
 * included), then their uploaded files, any sign-in codes, and finally the auth user itself. Safe to run again if a
 * later step fails: each step finds nothing left to do.
 */
export async function deleteAccount(uid: string): Promise<{ deletedCommunities: number; transferredCommunities: number }> {
  const { data: profile } = await supabaseAdmin.from("profiles").select("email").eq("id", uid).maybeSingle();
  const media = await listPostMediaObjects(uid);

  const { data, error } = await supabaseAdmin.rpc("delete_account", { p_user_id: uid });
  if (error) throw new Error(`deleteAccount(${uid}): ${error.message}`);
  const result = (data ?? {}) as { deletedCommunities?: number; transferredCommunities?: number };

  for (let i = 0; i < media.length; i += 100) {
    const { error: removeError } = await supabaseAdmin.storage.from("post-media").remove(media.slice(i, i + 100).map((o) => o.name));
    if (removeError) throw new Error(`deleteAccount(${uid}) files: ${removeError.message}`);
  }
  const email = (profile?.email as string | null | undefined) ?? null;
  if (email) await supabaseAdmin.from("otp_codes").delete().eq("email", email);

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(uid);
  if (authError && !/not.?found/i.test(authError.message)) throw new Error(`deleteAccount(${uid}) auth: ${authError.message}`);

  return { deletedCommunities: result.deletedCommunities ?? 0, transferredCommunities: result.transferredCommunities ?? 0 };
}
