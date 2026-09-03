import { creditPoints, spendPoints } from "@/lib/supabase/points";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { getRaceById } from "@/lib/supabase/races";
import { requireAdmin, requireMember } from "@/lib/supabase/groups";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ServiceError } from "@/services/errors";
import type { RaceDoc } from "@/lib/types/race";
// Types + predictionTypeLabels live in the pure groupPredictionTypes.ts, not here - see that
// file's own comment for why a client component importing them from *this* module (which reaches
// otp.ts's nodemailer import through groups.ts) crashed the production build. Re-exported so every
// existing server-side import of `@/lib/supabase/groupPredictions` keeps working unchanged.
export type { GroupPrediction, PredictionGuess, PredictionStatus, PredictionType } from "@/lib/groupPredictionTypes";
export { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { GroupPrediction, PredictionGuess, PredictionStatus, PredictionType } from "@/lib/groupPredictionTypes";
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";

// Omit entryCount/myEntry, not reuse them with placeholder values - this summary genuinely
// doesn't fetch either (see listMyOpenPredictions' own comment), and a fabricated 0/null would
// look like real data to any caller that didn't already know better.
export type FeedPrediction = Omit<GroupPrediction, "entryCount" | "myEntry"> & { groupName: string; hasEntered: boolean };

/** Groups home's right-sidebar widget: open predictions across every group the user has joined,
 * most recent first - a real cross-group query, not a per-group fetch repeated N times. Kept to a
 * summary (race/type/entry cost/whether they've already entered); actually entering still happens
 * in the real group's own Predictions tab (GroupPredictions.tsx already owns the guess UI, the
 * driver roster lookup, etc. - duplicating that into a sidebar widget would be a second, parallel
 * implementation of the same interaction for no real benefit). */
export async function listMyOpenPredictions(uid: string, limit = 5): Promise<FeedPrediction[]> {
  const { data: memberships, error: membershipsError } = await queryWithRetry(() => supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid));
  if (membershipsError) throw new Error(`listMyOpenPredictions: ${membershipsError.message}`);
  const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id as string))];
  if (groupIds.length === 0) return [];

  const { data: predictions, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_predictions").select("*").in("group_id", groupIds).eq("status", "open").order("created_at", { ascending: false }).limit(limit),
  );
  if (error) throw new Error(`listMyOpenPredictions: ${error.message}`);
  if (!predictions?.length) return [];

  const predictionIds = predictions.map((p) => p.id as string);
  const raceIds = [...new Set(predictions.map((p) => p.race_id as string))];
  const predictionGroupIds = [...new Set(predictions.map((p) => p.group_id as string))];
  const [{ data: races, error: racesError }, { data: groupsData, error: groupsError }, { data: myEntries, error: entriesError }] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("races").select("id, name").in("id", raceIds)),
    queryWithRetry(() => supabaseAdmin.from("groups").select("id, name").in("id", predictionGroupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id").eq("user_id", uid).in("prediction_id", predictionIds)),
  ]);
  if (racesError) throw new Error(`listMyOpenPredictions: ${racesError.message}`);
  if (groupsError) throw new Error(`listMyOpenPredictions: ${groupsError.message}`);
  if (entriesError) throw new Error(`listMyOpenPredictions: ${entriesError.message}`);

  const raceNameById = new Map((races ?? []).map((r) => [r.id as string, r.name as string]));
  const groupNameById = new Map((groupsData ?? []).map((g) => [g.id as string, g.name as string]));
  const enteredSet = new Set((myEntries ?? []).map((e) => e.prediction_id as string));

  return predictions.map((p) => ({
    id: p.id as string,
    groupId: p.group_id as string,
    groupName: groupNameById.get(p.group_id as string) ?? "a group",
    raceId: p.race_id as string,
    raceName: raceNameById.get(p.race_id as string) ?? (p.race_id as string),
    type: p.type as PredictionType,
    entryPoints: p.entry_points as number,
    status: p.status as PredictionStatus,
    correctAnswer: (p.correct_answer as PredictionGuess | null) ?? null,
    createdAt: p.created_at as string,
    resolvedAt: (p.resolved_at as string | null) ?? null,
    hasEntered: enteredSet.has(p.id as string),
  }));
}

export async function createPrediction(
  groupId: string,
  uid: string,
  input: { raceId: string; type: PredictionType; entryPoints: number },
): Promise<{ id: string }> {
  await requireAdmin(groupId, uid);
  if (!Number.isInteger(input.entryPoints) || input.entryPoints < 0) throw new ServiceError("Entry value must be a non-negative whole number.", 400);

  const race = await getRaceById(input.raceId);
  if (!race) throw new ServiceError("That race doesn't exist.", 404);
  if (race.status === "completed") throw new ServiceError("That race has already finished.", 400);

  const { data, error } = await supabaseAdmin
    .from("group_predictions")
    .insert({ group_id: groupId, race_id: input.raceId, type: input.type, entry_points: input.entryPoints, created_by: uid })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new ServiceError(`This group already has a ${predictionTypeLabels[input.type]} prediction for that race.`, 409);
    throw new Error(`createPrediction(${groupId}): ${error.message}`);
  }
  return { id: data.id as string };
}

export async function listPredictions(groupId: string, uid: string): Promise<GroupPrediction[]> {
  await requireMember(groupId, uid);

  const { data: predictions, error } = await queryWithRetry(() =>
    supabaseAdmin.from("group_predictions").select("*").eq("group_id", groupId).order("created_at", { ascending: false }),
  );
  if (error) throw new Error(`listPredictions(${groupId}): ${error.message}`);
  if (!predictions?.length) return [];

  const predictionIds = predictions.map((p) => p.id as string);
  const raceIds = [...new Set(predictions.map((p) => p.race_id as string))];
  const [{ data: entries, error: entriesError }, { data: races, error: racesError }] = await Promise.all([
    queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id, user_id, guess, points_wagered, points_awarded").in("prediction_id", predictionIds)),
    queryWithRetry(() => supabaseAdmin.from("races").select("id, name").in("id", raceIds)),
  ]);
  if (entriesError) throw new Error(`listPredictions(${groupId}): ${entriesError.message}`);
  if (racesError) throw new Error(`listPredictions(${groupId}): ${racesError.message}`);

  const raceNameById = new Map((races ?? []).map((r) => [r.id as string, r.name as string]));
  const entryCountByPrediction = new Map<string, number>();
  const myEntryByPrediction = new Map<string, { guess: PredictionGuess; pointsWagered: number; pointsAwarded: number | null }>();
  for (const e of entries ?? []) {
    const pid = e.prediction_id as string;
    entryCountByPrediction.set(pid, (entryCountByPrediction.get(pid) ?? 0) + 1);
    if (e.user_id === uid) {
      myEntryByPrediction.set(pid, { guess: e.guess as PredictionGuess, pointsWagered: e.points_wagered as number, pointsAwarded: e.points_awarded as number | null });
    }
  }

  return predictions.map((p) => ({
    id: p.id as string,
    groupId: p.group_id as string,
    raceId: p.race_id as string,
    raceName: raceNameById.get(p.race_id as string) ?? p.race_id as string,
    type: p.type as PredictionType,
    entryPoints: p.entry_points as number,
    status: p.status as PredictionStatus,
    correctAnswer: (p.correct_answer as PredictionGuess | null) ?? null,
    createdAt: p.created_at as string,
    resolvedAt: (p.resolved_at as string | null) ?? null,
    entryCount: entryCountByPrediction.get(p.id as string) ?? 0,
    myEntry: myEntryByPrediction.get(p.id as string) ?? null,
  }));
}

function validateGuess(type: PredictionType, guess: unknown): PredictionGuess {
  if (type === "podium") {
    if (!Array.isArray(guess) || guess.length !== 3 || guess.some((d) => typeof d !== "string" || !d)) {
      throw new ServiceError("Pick 3 different drivers for the podium.", 400);
    }
    if (new Set(guess).size !== 3) throw new ServiceError("Pick 3 different drivers for the podium.", 400);
    return guess as [string, string, string];
  }
  if (type === "dnf_count") {
    if (typeof guess !== "number" || !Number.isInteger(guess) || guess < 0) throw new ServiceError("Enter a whole number of DNFs.", 400);
    return guess;
  }
  if (typeof guess !== "string" || !guess) throw new ServiceError("Select a driver.", 400);
  return guess;
}

/** Points are taken at entry time, not staged for later - if the entry row then fails to insert
 * (the realistic case: a genuine double-submit racing against this same function, caught by
 * group_prediction_entries' own primary key), the just-taken points are refunded immediately
 * rather than left charged against a prediction the user was never actually entered into. */
export async function enterPrediction(groupId: string, predictionId: string, uid: string, rawGuess: unknown): Promise<void> {
  await requireMember(groupId, uid);

  const { data: prediction, error } = await supabaseAdmin.from("group_predictions").select("*").eq("id", predictionId).eq("group_id", groupId).maybeSingle();
  if (error) throw new Error(`enterPrediction(${predictionId}): ${error.message}`);
  if (!prediction) throw new ServiceError("Prediction not found.", 404);
  if (prediction.status !== "open") throw new ServiceError("This prediction is no longer open for entries.", 400);

  const guess = validateGuess(prediction.type as PredictionType, rawGuess);
  const entryPoints = prediction.entry_points as number;

  if (entryPoints > 0) await spendPoints(uid, entryPoints, "prediction_entry", { groupId, predictionId });

  const { error: insertError } = await supabaseAdmin
    .from("group_prediction_entries")
    .insert({ prediction_id: predictionId, user_id: uid, guess, points_wagered: entryPoints });
  if (insertError) {
    if (entryPoints > 0) await creditPoints(uid, entryPoints, "prediction_refund", { groupId, predictionId });
    if (insertError.code === "23505") throw new ServiceError("You've already entered this prediction.", 409);
    throw new Error(`enterPrediction(${predictionId}): ${insertError.message}`);
  }
}

// Every entry pays back double its wager for a fully correct guess - a simple, easy-to-explain
// "double or nothing" model rather than a pari-mutuel pool (which would need to account for how
// many other entrants also guessed right, adding real complexity for a v1 virtual points game).
// Podium reuses the same 3/1/0-per-slot convention pipeline/compute_group_scores.py already
// established for the personal-picks leaderboard (exact slot = 3, right driver/wrong slot = 1,
// miss = 0, out of a max of 9) so "how close was I" reads consistently across both systems, scaled
// into a payout fraction of the double-payout ceiling instead of a raw leaderboard score.
function resolveWinner(race: RaceDoc): string | null {
  return race.results?.find((r) => r.finishPosition === 1)?.driver ?? null;
}
function resolvePole(race: RaceDoc): string | null {
  return race.poleSitter ?? null;
}
function resolveFastestLap(race: RaceDoc): string | null {
  const withTime = (race.results ?? []).filter((r) => r.fastestLapSec !== null);
  if (!withTime.length) return null;
  return withTime.reduce((best, r) => (r.fastestLapSec! < best.fastestLapSec! ? r : best)).driver;
}
function resolveDnfCount(race: RaceDoc): number {
  return (race.results ?? []).filter((r) => r.status === "dnf").length;
}
function resolvePodium(race: RaceDoc): [string, string, string] | null {
  const top3 = (race.results ?? [])
    .filter((r) => r.finishPosition <= 3)
    .sort((a, b) => a.finishPosition - b.finishPosition)
    .map((r) => r.driver);
  return top3.length === 3 ? (top3 as [string, string, string]) : null;
}

function podiumSlotScore(guess: [string, string, string], actual: [string, string, string]): number {
  const actualSet = new Set(actual);
  return guess.reduce((score, pick, i) => score + (actual[i] === pick ? 3 : actualSet.has(pick) ? 1 : 0), 0);
}

/** Admin-triggered, not an automatic pipeline step - deliberately, for this v1: every input this
 * needs (results, pole, per-driver fastest lap) already sits on `races` the moment a race's status
 * flips to "completed" via the existing fetch_races.py write, so "resolve" is a pure read+compute
 * over data this app already has in Postgres - no new Python/cron job needed to keep it fresh, an
 * admin visiting the group after race day and clicking "Resolve" covers the real use case. */
export async function resolvePrediction(groupId: string, predictionId: string, uid: string): Promise<void> {
  await requireAdmin(groupId, uid);

  const { data: prediction, error } = await supabaseAdmin.from("group_predictions").select("*").eq("id", predictionId).eq("group_id", groupId).maybeSingle();
  if (error) throw new Error(`resolvePrediction(${predictionId}): ${error.message}`);
  if (!prediction) throw new ServiceError("Prediction not found.", 404);
  if (prediction.status === "resolved") throw new ServiceError("This prediction has already been resolved.", 400);

  const race = await getRaceById(prediction.race_id as string);
  if (!race || race.status !== "completed" || !race.results?.length) {
    throw new ServiceError("This race hasn't finished yet - results aren't available to resolve against.", 400);
  }

  const type = prediction.type as PredictionType;
  let correctAnswer: PredictionGuess | null;
  if (type === "winner") correctAnswer = resolveWinner(race);
  else if (type === "pole") correctAnswer = resolvePole(race);
  else if (type === "fastest_lap") correctAnswer = resolveFastestLap(race);
  else if (type === "dnf_count") correctAnswer = resolveDnfCount(race);
  else correctAnswer = resolvePodium(race);
  if (correctAnswer === null) throw new ServiceError("This race's data doesn't have what's needed to resolve this prediction type yet.", 400);

  const { data: entries, error: entriesError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_prediction_entries").select("user_id, guess, points_wagered").eq("prediction_id", predictionId),
  );
  if (entriesError) throw new Error(`resolvePrediction(${predictionId}): ${entriesError.message}`);

  for (const entry of entries ?? []) {
    const wagered = entry.points_wagered as number;
    let payoutFraction = 0;
    if (type === "podium") {
      payoutFraction = podiumSlotScore(entry.guess as [string, string, string], correctAnswer as [string, string, string]) / 9;
    } else {
      payoutFraction = entry.guess === correctAnswer ? 1 : 0;
    }
    const payout = Math.round(wagered * payoutFraction * 2);

    await supabaseAdmin
      .from("group_prediction_entries")
      .update({ points_awarded: payout })
      .eq("prediction_id", predictionId)
      .eq("user_id", entry.user_id as string);
    if (payout > 0) await creditPoints(entry.user_id as string, payout, "prediction_payout", { groupId, predictionId });
  }

  await supabaseAdmin
    .from("group_predictions")
    .update({ status: "resolved", correct_answer: correctAnswer, resolved_at: new Date().toISOString() })
    .eq("id", predictionId);
}
