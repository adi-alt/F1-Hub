import { supabaseAdmin } from "@/lib/supabase/admin";
import { ServiceError } from "@/services/errors";

export type PointsReason = "starting_grant" | "prediction_entry" | "prediction_payout" | "prediction_refund";

export async function getPointsBalance(uid: string): Promise<number> {
  return getBalance(uid);
}

async function getBalance(uid: string): Promise<number> {
  const { data, error } = await supabaseAdmin.from("profiles").select("points_balance").eq("id", uid).maybeSingle();
  if (error) throw new Error(`getBalance(${uid}): ${error.message}`);
  if (!data) throw new ServiceError("Profile not found.", 404);
  return data.points_balance as number;
}

export type RecentTransaction = { amount: number; reason: PointsReason; createdAt: string };

/** The homepage's "recent activity" strip reads real transactions, not a fabricated activity log —
 * this table already has everything needed (see logTransaction below), just never had a list read. */
export async function listRecentTransactions(uid: string, limit: number): Promise<RecentTransaction[]> {
  const { data, error } = await supabaseAdmin
    .from("points_transactions")
    .select("amount, reason, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentTransactions(${uid}): ${error.message}`);
  return (data ?? []).map((row) => ({ amount: row.amount as number, reason: row.reason as PointsReason, createdAt: row.created_at as string }));
}

async function logTransaction(uid: string, amount: number, reason: PointsReason, opts: { groupId?: string; predictionId?: string }): Promise<void> {
  const { error } = await supabaseAdmin
    .from("points_transactions")
    .insert({ user_id: uid, amount, reason, group_id: opts.groupId ?? null, prediction_id: opts.predictionId ?? null });
  if (error) throw new Error(`logTransaction(${uid}): ${error.message}`);
}

/** Deducts `amount` from a user's balance - no Postgres function needed for this to be safe against
 * a real concurrent double-spend: the write's own `.eq("points_balance", current)` is a
 * compare-and-swap guard, not just a plain update - if any other request already changed the
 * balance between this function's own read and write, the update matches zero rows and this throws
 * instead of silently computing a stale, wrong new balance. The other real double-spend vector (a
 * genuine double-submit of the *same* prediction entry) is closed by group_prediction_entries' own
 * primary key, not by this function - see enterPrediction's own comment on call order. */
export async function spendPoints(uid: string, amount: number, reason: PointsReason, opts: { groupId?: string; predictionId?: string } = {}): Promise<number> {
  if (amount <= 0) throw new ServiceError("Invalid points amount.", 400);
  const current = await getBalance(uid);
  if (current < amount) throw new ServiceError(`You need at least ${amount} points to enter this prediction. Current balance: ${current} points.`, 400);

  const { data: updated, error } = await supabaseAdmin
    .from("profiles")
    .update({ points_balance: current - amount })
    .eq("id", uid)
    .eq("points_balance", current)
    .select("points_balance")
    .maybeSingle();
  if (error) throw new Error(`spendPoints(${uid}): ${error.message}`);
  if (!updated) throw new ServiceError("Your points balance just changed - please try again.", 409);

  await logTransaction(uid, -amount, reason, opts);
  return updated.points_balance as number;
}

/** Adds `amount` to a user's balance (a payout or refund) - the same compare-and-swap write as
 * spendPoints, but retried a few times on a lost race (safe here, unlike a spend, since there's no
 * risk of ever computing a negative number - only of two concurrent credits stepping on each
 * other's read, which a short retry loop resolves cleanly). Used by prediction resolution, which
 * can credit several winners' balances back to back. */
export async function creditPoints(uid: string, amount: number, reason: PointsReason, opts: { groupId?: string; predictionId?: string } = {}): Promise<number> {
  if (amount <= 0) throw new ServiceError("Invalid points amount.", 400);

  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await getBalance(uid);
    const { data: updated, error } = await supabaseAdmin
      .from("profiles")
      .update({ points_balance: current + amount })
      .eq("id", uid)
      .eq("points_balance", current)
      .select("points_balance")
      .maybeSingle();
    if (error) throw new Error(`creditPoints(${uid}): ${error.message}`);
    if (updated) {
      await logTransaction(uid, amount, reason, opts);
      return updated.points_balance as number;
    }
    // Lost the race to another concurrent credit for this same user - re-read and retry rather
    // than fail; a credit is always safe to retry since it can never push the balance negative.
  }
  throw new ServiceError("Could not update points balance - please try again.", 409);
}
