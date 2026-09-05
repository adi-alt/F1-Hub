import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRaceStatus } from "@/lib/supabase/races";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { ServiceError } from "@/services/errors";
import type { UserPick } from "@/lib/types/race";

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
export async function getUserPicksForYear(uid: string, year: number): Promise<UserPick[]> {
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("picks").select("*").eq("user_id", uid).like("race_id", `${year}_%`),
  );
  if (error) throw new Error(`getUserPicksForYear(${uid}, ${year}): ${error.message}`);
  return ((data ?? []) as PickRow[]).map(fromRow);
}

/** The write side of the same row — one upsert, since (user_id, race_id) is the primary key.
 * Enforced server-side, not just by PickPanel hiding its own save button: once group scoring
 * (compute_group_scores.py) exists, a pick submitted after the actual result is known isn't just
 * a UX quirk, it's a way to cheat the leaderboard. */
export async function saveUserPick(uid: string, pick: UserPick): Promise<void> {
  const status = await getRaceStatus(pick.raceId);
  if (status !== "upcoming") {
    throw new ServiceError("Picks are closed for this race.", 403);
  }
  const { error } = await supabaseAdmin.from("picks").upsert({
    user_id: uid,
    race_id: pick.raceId,
    predicted_winner: pick.predictedWinner,
    predicted_podium: pick.predictedPodium,
    submitted_at: pick.submittedAt,
  });
  // Unchecked before this - a failed save looked identical to a successful one to the caller.
  if (error) throw new Error(`saveUserPick(${uid}, ${pick.raceId}): ${error.message}`);
}
