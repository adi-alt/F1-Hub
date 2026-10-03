import { unstable_cache } from "next/cache";
import { expireTag } from "@/lib/cacheTags";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { ServiceError } from "@/services/errors";
import type { UserPick } from "@/lib/types/race";

// Same coarse-grained "bust everything on any write" strategy as users.ts's USER_PROFILE_TAG - a
// real, measured 500-1200ms Supabase round trip per getUserPicksForYear call (2026-09-10 perf
// audit) was one of the two dominant remaining costs on an otherwise cache-hit-fast authenticated
// homepage request.
const USER_PICKS_TAG = "user-picks";

type PickRow = { race_id: string; predicted_winner: string; predicted_podium: string[]; submitted_at: string };

function fromRow(row: PickRow): UserPick {
  return {
    raceId: row.race_id,
    predictedWinner: row.predicted_winner,
    predictedPodium: row.predicted_podium as [string, string, string],
    submittedAt: row.submitted_at,
  };
}

/** Server-side read so pages can render a signed-in user's existing pick with no client fetch/flash. */
export async function getUserPick(uid: string, raceId: string): Promise<UserPick | null> {
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("picks").select("*").eq("user_id", uid).eq("race_id", raceId).maybeSingle(),
  );
  if (error) throw new Error(`getUserPick(${uid}, ${raceId}): ${error.message}`);
  return data ? fromRow(data as PickRow) : null;
}

/** Every pick a user made this season, for the homepage's prediction-performance view — one query
 * instead of the per-race `getUserPick` looped over every round. `race_id`s are `${year}_r${round}_
 * {slug}` (see races.ts), so a prefix match is a real year filter, not a substring coincidence. */
export const getUserPicksForYear = unstable_cache(
  async (uid: string, year: number): Promise<UserPick[]> => {
    const { data, error } = await queryWithRetry(() =>
      supabaseAdmin.from("picks").select("*").eq("user_id", uid).like("race_id", `${year}_%`),
    );
    if (error) throw new Error(`getUserPicksForYear(${uid}, ${year}): ${error.message}`);
    return ((data ?? []) as PickRow[]).map(fromRow);
  },
  ["get-user-picks-for-year"],
  { revalidate: false, tags: [USER_PICKS_TAG] },
);

/** The write side of the same row. The deadline is enforced by save_pick() in the database
 * (20260930_prediction_lifecycle.sql): a pick is refused once the race has started (start of the
 * calendar's Race session) or the race is no longer upcoming, and `submitted_at` is stamped by the
 * server's clock - it used to be whatever the client sent, and the only lock was "results have been
 * ingested", which let picks be changed during the race (audit SEC-07). A pick submitted after the
 * result is known is a way to cheat the leaderboard (compute_group_scores.py), so this is enforced
 * here, not just by PickPanel hiding its own save button. */
export async function saveUserPick(uid: string, pick: Omit<UserPick, "submittedAt">): Promise<void> {
  const { error } = await supabaseAdmin.rpc("save_pick", {
    p_user_id: uid,
    p_race_id: pick.raceId,
    p_winner: pick.predictedWinner,
    p_podium: pick.predictedPodium,
  });
  if (error) {
    if (error.message.includes("picks_closed")) throw new ServiceError("Picks are closed for this race.", 403, "picks_closed");
    if (error.message.includes("race_not_found")) throw new ServiceError("That race doesn't exist.", 404, "race_not_found");
    if (error.message.includes("invalid_pick")) throw new ServiceError("Pick a winner and three drivers for the podium.", 400, "invalid_pick");
    throw new Error(`saveUserPick(${uid}, ${pick.raceId}): ${error.message}`);
  }
  expireTag(USER_PICKS_TAG);
}
