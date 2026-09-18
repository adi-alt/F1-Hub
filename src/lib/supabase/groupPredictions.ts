import { creditPoints, spendPoints } from "@/lib/supabase/points";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { getRaceById, promoteCalendarRace } from "@/lib/supabase/races";
import { getAllCurrentDrivers } from "@/lib/supabase/media";
import { canDo } from "@/lib/communities";
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

// Omit entryCount, not reuse it with a placeholder value - this summary genuinely doesn't fetch it
// (see listMyOpenPredictions' own comment), and a fabricated 0 would look like real data to any
// caller that didn't already know better. `myGuess` IS fetched, because the same query that
// establishes `hasEntered` already has to read the row it lives on - so "Your pick: VER" costs
// nothing beyond selecting one more column.
export type FeedPrediction = Omit<GroupPrediction, "entryCount" | "myEntry"> & {
  groupName: string;
  hasEntered: boolean;
  myGuess: PredictionGuess | null;
  /** The viewer's own pick, resolved to real driver names server-side ("Max Verstappen", not
   * "VER"). Null when they haven't entered - never a placeholder. */
  myGuessLabel: string | null;
};

/** A stored guess rendered as something a person can read. Driver codes become real names where
 * the roster knows them and stay as the code where it doesn't, which is the honest outcome for a
 * driver who has since left the grid. */
export function describeGuess(type: PredictionType, guess: PredictionGuess, driverNameByCode: Map<string, string>): string {
  if (type === "dnf_count") return typeof guess === "number" ? `${guess} ${guess === 1 ? "retirement" : "retirements"}` : String(guess);
  if (type === "podium" && Array.isArray(guess)) return guess.map((code) => driverNameByCode.get(code) ?? code).join(", ");
  return typeof guess === "string" ? (driverNameByCode.get(guess) ?? guess) : String(guess);
}

/** One aggregated option in a prediction's community trend. `pct` is a real share of `total`,
 * rounded for display only. */
export type PredictionTrendOption = { key: string; label: string; count: number; pct: number };

export type PredictionTrend = {
  /** Real number of entries behind this aggregate. The UI decides what counts as "enough to
   * show" - this never hides or pads it. */
  total: number;
  options: PredictionTrendOption[];
};

/** How many distinct options a trend lists before the remainder is grouped into "Other". */
const TREND_TOP_N = 4;

/**
 * What the community has actually entered for one prediction round, aggregated server-side.
 *
 * Every number comes from real `group_prediction_entries` rows - there is no sampling, no
 * estimate, and no fallback that invents a distribution when nobody has entered yet (`total: 0`
 * with no options is a real, representable answer, and the card says so rather than drawing empty
 * bars).
 *
 * Individual entries are never returned, only counts: a member should be able to see which way the
 * community is leaning without seeing who picked what, which would leak other members' picks while
 * the round is still open. Membership is required to see even the aggregate.
 */
export async function getPredictionTrend(predictionId: string, uid: string): Promise<PredictionTrend> {
  const { data: prediction, error: predictionError } = await queryWithRetry(() =>
    supabaseAdmin.from("group_predictions").select("id, group_id, type").eq("id", predictionId).maybeSingle(),
  );
  if (predictionError) throw new Error(`getPredictionTrend(${predictionId}): ${predictionError.message}`);
  if (!prediction) throw new ServiceError("That prediction doesn't exist.", 404);

  await requireMember(prediction.group_id as string, uid);

  const { data: entries, error } = await queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("guess").eq("prediction_id", predictionId));
  if (error) throw new Error(`getPredictionTrend(${predictionId}): ${error.message}`);

  const rows = entries ?? [];
  if (rows.length === 0) return { total: 0, options: [] };

  const type = prediction.type as PredictionType;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = trendKeyFor(type, row.guess as PredictionGuess);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return { total: 0, options: [] };

  // Driver names only matter for the types whose key IS a driver code - a DNF-count trend's keys
  // are numbers, and looking up a roster for them would be a wasted query.
  const needsDriverNames = type === "winner" || type === "podium" || type === "fastest_lap" || type === "pole";
  const driverNameByCode = needsDriverNames ? new Map((await getAllCurrentDrivers()).map((d) => [d.code, d.name])) : new Map<string, string>();

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, TREND_TOP_N);
  const restCount = sorted.slice(TREND_TOP_N).reduce((sum, [, n]) => sum + n, 0);

  const options: PredictionTrendOption[] = top.map(([key, count]) => ({
    key,
    label: labelForTrendKey(type, key, driverNameByCode),
    count,
    pct: Math.round((count / total) * 100),
  }));
  if (restCount > 0) options.push({ key: "__other__", label: "Other", count: restCount, pct: Math.round((restCount / total) * 100) });

  return { total, options };
}

/** The one facet of a guess a trend groups by. A podium guess is three drivers, which has no
 * single meaningful distribution - the winner pick is the part members actually compare, so that's
 * what's aggregated, and the card labels it as such rather than implying the whole podium matched. */
function trendKeyFor(type: PredictionType, guess: PredictionGuess): string | null {
  if (type === "podium") return Array.isArray(guess) && typeof guess[0] === "string" ? guess[0] : null;
  if (type === "dnf_count") return typeof guess === "number" ? String(guess) : null;
  return typeof guess === "string" ? guess : null;
}

function labelForTrendKey(type: PredictionType, key: string, driverNameByCode: Map<string, string>): string {
  if (type === "dnf_count") return `${key} ${key === "1" ? "retirement" : "retirements"}`;
  return driverNameByCode.get(key) ?? key;
}

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
    queryWithRetry(() => supabaseAdmin.from("races").select("id, name, race_date, status").in("id", raceIds)),
    queryWithRetry(() => supabaseAdmin.from("groups").select("id, name").in("id", predictionGroupIds)),
    queryWithRetry(() => supabaseAdmin.from("group_prediction_entries").select("prediction_id, guess").eq("user_id", uid).in("prediction_id", predictionIds)),
  ]);
  if (racesError) throw new Error(`listMyOpenPredictions: ${racesError.message}`);
  if (groupsError) throw new Error(`listMyOpenPredictions: ${groupsError.message}`);
  if (entriesError) throw new Error(`listMyOpenPredictions: ${entriesError.message}`);

  const raceById = new Map((races ?? []).map((r) => [r.id as string, r]));
  const groupNameById = new Map((groupsData ?? []).map((g) => [g.id as string, g.name as string]));
  const myGuessByPrediction = new Map((myEntries ?? []).map((e) => [e.prediction_id as string, (e.guess as PredictionGuess | null) ?? null]));
  // Only pay for the roster when the viewer has actually entered something that needs naming -
  // the common case (nothing entered yet) skips the lookup entirely. getAllCurrentDrivers is
  // itself cached, so even when it does run it is not a fresh round trip per request.
  const driverNameByCode = myGuessByPrediction.size > 0 ? new Map((await getAllCurrentDrivers()).map((d) => [d.code, d.name])) : new Map<string, string>();

  return predictions.map((p) => ({
    id: p.id as string,
    groupId: p.group_id as string,
    groupName: groupNameById.get(p.group_id as string) ?? "a group",
    raceId: p.race_id as string,
    raceName: (raceById.get(p.race_id as string)?.name as string | undefined) ?? (p.race_id as string),
    raceDate: (raceById.get(p.race_id as string)?.race_date as string | null | undefined) ?? null,
    raceStatus: (raceById.get(p.race_id as string)?.status as string | null | undefined) ?? null,
    type: p.type as PredictionType,
    entryPoints: p.entry_points as number,
    status: p.status as PredictionStatus,
    correctAnswer: (p.correct_answer as PredictionGuess | null) ?? null,
    createdAt: p.created_at as string,
    resolvedAt: (p.resolved_at as string | null) ?? null,
    hasEntered: myGuessByPrediction.has(p.id as string),
    myGuess: myGuessByPrediction.get(p.id as string) ?? null,
    myGuessLabel: resolveMyGuessLabel(p.type as PredictionType, myGuessByPrediction.get(p.id as string) ?? null, driverNameByCode),
  }));
}

function resolveMyGuessLabel(type: PredictionType, guess: PredictionGuess | null, driverNameByCode: Map<string, string>): string | null {
  return guess === null ? null : describeGuess(type, guess, driverNameByCode);
}

export async function createPrediction(
  groupId: string,
  uid: string,
  input: { raceId: string; type: PredictionType; entryPoints: number },
): Promise<{ id: string }> {
  // Permission-driven rather than hardcoded admin: a community can open this up to moderators or
  // all members. Defaults to admins, which is exactly what this was before.
  const role = await requireMember(groupId, uid);
  const { data: group, error: groupError } = await supabaseAdmin.from("groups").select("permissions").eq("id", groupId).maybeSingle();
  if (groupError) throw new Error(`createPrediction(${groupId}): ${groupError.message}`);
  if (!canDo(group?.permissions, "createPredictions", role)) {
    throw new ServiceError("Only certain roles can create prediction rounds in this community.", 403);
  }
  if (!Number.isInteger(input.entryPoints) || input.entryPoints < 0) throw new ServiceError("Entry value must be a non-negative whole number.", 400);

  // A round that hasn't had any FastF1 session yet only exists as a `calendar` placeholder, not a
  // real `races` row - promote it on first use instead of rejecting the pick (see
  // promoteCalendarRace's own comment for why).
  const race = (await getRaceById(input.raceId)) ?? (await promoteCalendarRace(input.raceId));
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
    queryWithRetry(() => supabaseAdmin.from("races").select("id, name, race_date, status").in("id", raceIds)),
  ]);
  if (entriesError) throw new Error(`listPredictions(${groupId}): ${entriesError.message}`);
  if (racesError) throw new Error(`listPredictions(${groupId}): ${racesError.message}`);

  const raceById = new Map((races ?? []).map((r) => [r.id as string, r]));
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
    raceName: (raceById.get(p.race_id as string)?.name as string | undefined) ?? (p.race_id as string),
    raceDate: (raceById.get(p.race_id as string)?.race_date as string | null | undefined) ?? null,
    raceStatus: (raceById.get(p.race_id as string)?.status as string | null | undefined) ?? null,
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
