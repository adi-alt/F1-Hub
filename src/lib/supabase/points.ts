import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ServiceError } from "@/services/errors";

export type PointsReason = "starting_grant" | "prediction_entry" | "prediction_payout" | "prediction_refund";

// Display-only, safe to cache briefly: nothing decides whether a spend is allowed from this - the
// database function that charges an entry checks the real balance inside its own transaction, so a
// stale read here can never let anyone spend points they don't actually have. Short TTL (not revalidate:false
// + a tag) because there's no pipeline write to hang a tag off - this table only ever changes from
// prediction entry/payout transactions, same reasoning as modelBenchmarks.ts's own short-timer precedent.
const BALANCE_REVALIDATE_SECONDS = 15;

export const getPointsBalance = unstable_cache(
  async (uid: string): Promise<number> => getBalance(uid),
  ["get-points-balance"],
  { revalidate: BALANCE_REVALIDATE_SECONDS },
);

async function getBalance(uid: string): Promise<number> {
  const { data, error } = await supabaseAdmin.from("profiles").select("points_balance").eq("id", uid).maybeSingle();
  if (error) throw new Error(`getBalance(${uid}): ${error.message}`);
  if (!data) throw new ServiceError("Profile not found.", 404);
  return data.points_balance as number;
}

export type RecentTransaction = { amount: number; reason: PointsReason; createdAt: string };

/** The homepage's "recent activity" strip reads real transactions, not a fabricated activity log —
 * this table already has everything needed (written by the entry/payout database functions), just never had a list read. */
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

// There is deliberately no spend/credit function here. Every balance change is made inside a
// database function that also writes its ledger row in the same transaction - enter_prediction()
// (entry fee) and settle_prediction() (payout), supabase/migrations/20260930_prediction_lifecycle.sql.
// The previous spendPoints/creditPoints did a compare-and-swap on the balance and THEN inserted the
// ledger row as a separate statement, so a failure in between left a balance change with no record
// and a retry could apply it twice. Nothing should change a balance from application code.
