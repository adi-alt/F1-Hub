// Derived view-model over picks + races, same role personalization.ts already plays for
// favorites/standings — never a stored metric, always recomputed from real picks/race_results.
//
// Deliberately three separate, precisely-defined numbers instead of one blended "accuracy %":
// there's no mathematically meaningful way to combine "did you call the winner" and "how many
// exact podium slots did you get right" into a single percentage without hiding what it actually
// measures. `podiumSlots` reuses the same exact-slot definition pipeline/compute_group_scores.py
// scores 3/1/0 points on (predicted slot i == the driver who finished position i+1) — same
// correct/incorrect check, not its point value or leaderboard aggregation.

import type { RaceDoc, UserPick } from "@/lib/types/race";

export type RecentPredictionResult = "winner" | "partial" | "miss";

export type PredictionPerformance = {
  winner: { correct: number; total: number };
  podiumSlots: { correct: number; total: number };
  /** Mean |predicted slot − actual finish position| across every predicted slot whose driver
   * actually classified (a DNF'd pick is still counted against podiumSlots, just excluded here —
   * "how far off" is meaningless for a car that didn't finish). Null with nothing to average. */
  avgPositionError: number | null;
  recent: { raceId: string; raceName: string; round: number; result: RecentPredictionResult }[];
};

export type PredictionFingerprint = {
  totalPredictions: number;
  winnerAccuracy: number; // 0-100
  podiumAccuracy: number; // 0-100
  avgPositionError: number | null;
  /** Average starting-grid position of the driver picked to win, across every classified pick -
   * a real, deterministic "do you back the pole-sitter or the underdog" signal (low = mostly picks
   * front-row starters, high = regularly backs a grid disadvantage). The model interprets this; it never
   * invents it. Null with no classified picks to average. */
  avgPredictedWinnerGrid: number | null;
  /** Fraction (0-100) of the user's picks whose predicted winner is *this season's final* points
   * leader - a simplified, retroactive "backs the championship favorite" proxy, not a per-race
   * "who led at the time" reconstruction (that would need a standings snapshot per race, which
   * isn't stored). Documented as an approximation, never presented as more precise than that. */
  pctPicksForSeasonLeader: number | null;
};

/** Application-computed prediction "fingerprint" - the numbers an AI prediction coach interprets,
 * never calculates itself (see docs/AGENTIC_AI.md's deterministic/AI split). Every field here is a
 * plain aggregate over real picks/race_results; nothing is inferred by a model. */
export function computePredictionFingerprint(picks: UserPick[], races: RaceDoc[], seasonPointsLeaderCode?: string | null): PredictionFingerprint {
  const performance = computePredictionPerformance(picks, races);
  const raceById = new Map(races.map((r) => [r.id, r]));

  const winnerAccuracy = performance.winner.total > 0 ? (performance.winner.correct / performance.winner.total) * 100 : 0;
  const podiumAccuracy = performance.podiumSlots.total > 0 ? (performance.podiumSlots.correct / performance.podiumSlots.total) * 100 : 0;

  const gridSamples: number[] = [];
  let leaderPicks = 0;
  let classifiedPicks = 0;
  for (const pick of picks) {
    const race = raceById.get(pick.raceId);
    if (!race || race.status !== "completed" || !race.results?.length) continue;
    classifiedPicks++;
    const grid = race.results.find((r) => r.driver === pick.predictedWinner)?.grid;
    if (grid != null) gridSamples.push(grid);
    if (seasonPointsLeaderCode && pick.predictedWinner === seasonPointsLeaderCode) leaderPicks++;
  }

  return {
    totalPredictions: performance.winner.total,
    winnerAccuracy,
    podiumAccuracy,
    avgPositionError: performance.avgPositionError,
    avgPredictedWinnerGrid: gridSamples.length > 0 ? gridSamples.reduce((a, b) => a + b, 0) / gridSamples.length : null,
    pctPicksForSeasonLeader: seasonPointsLeaderCode && classifiedPicks > 0 ? (leaderPicks / classifiedPicks) * 100 : null,
  };
}

/** The model's winner pick for a race — the highest calibrated win probability once a Monte Carlo
 * simulation exists, else whoever the Random Forest `finishOrder` puts at P1. A different question
 * from `PickVsModel.tsx`'s own `modelPositionFor(race, driver)` (which asks "what position does
 * the model predict for THIS driver") - this asks "who does the model predict to win at all",
 * needed for the Prediction Intelligence card's model-comparison line on a race that may not be
 * `nextRace` (PickVsModel/AIvsYou are both scoped to `nextRace` only). */
export function modelWinnerFor(race: RaceDoc): string | null {
  if (race.simulation?.drivers?.length) {
    const byP1 = [...race.simulation.drivers].sort((a, b) => b.p1 - a.p1)[0];
    if (byP1) return byP1.driver;
  }
  return race.prediction?.finishOrder.find((d) => d.predictedPosition === 1)?.driver ?? null;
}

export type LatestPredictionSummary = {
  raceId: string;
  raceName: string;
  round: number;
  predictedWinner: string;
  predictedPodium: [string, string, string];
  modelWinner: string | null;
  status: "pending" | "resolved";
  result?: RecentPredictionResult;
  actualWinner?: string;
};

/** The user's most recently *submitted* pick, resolved against its own race regardless of what
 * `nextRace` currently is (PickVsModel/AIvsYou can only ever show "your pick for nextRace" - once
 * that race is behind us, its own outcome falls out of their scope entirely). */
export function getLatestPredictionSummary(picks: UserPick[], races: RaceDoc[]): LatestPredictionSummary | null {
  if (picks.length === 0) return null;
  const latest = [...picks].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
  const race = races.find((r) => r.id === latest.raceId);
  if (!race) return null;

  const modelWinner = modelWinnerFor(race);
  const base = { raceId: race.id, raceName: race.name, round: race.round, predictedWinner: latest.predictedWinner, predictedPodium: latest.predictedPodium, modelWinner };

  if (race.status !== "completed" || !race.results?.length) {
    return { ...base, status: "pending" };
  }
  const actualWinner = race.results.find((r) => r.finishPosition === 1)?.driver;
  const { recent } = computePredictionPerformance([latest], races);
  return { ...base, status: "resolved", result: recent[0]?.result, actualWinner };
}

export const MIN_PREDICTIONS_FOR_TREND = 5;

export type PredictionStyleTrait = { label: string; detail: string };

/** Real, threshold-based traits only - gated on a real sample size, capped at 2 shown. Deliberately
 * not a "personality type" beyond these two concrete, defensible numbers - never claims a pattern
 * the data doesn't actually support. */
export function classifyPredictionStyle(
  fingerprint: PredictionFingerprint,
  picks: UserPick[],
  favoriteDriverCode: string | null,
): PredictionStyleTrait[] {
  if (fingerprint.totalPredictions < MIN_PREDICTIONS_FOR_TREND) return [];
  const traits: PredictionStyleTrait[] = [];

  if (fingerprint.avgPredictedWinnerGrid != null) {
    if (fingerprint.avgPredictedWinnerGrid <= 2.5) {
      traits.push({ label: "Backs pole-position pace", detail: `Average grid slot of your winner picks: P${fingerprint.avgPredictedWinnerGrid.toFixed(1)}` });
    } else if (fingerprint.avgPredictedWinnerGrid >= 5) {
      traits.push({ label: "Willing to back a grid underdog", detail: `Average grid slot of your winner picks: P${fingerprint.avgPredictedWinnerGrid.toFixed(1)}` });
    }
  }

  if (favoriteDriverCode) {
    const favoritePicks = picks.filter((p) => p.predictedWinner === favoriteDriverCode).length;
    const pct = (favoritePicks / picks.length) * 100;
    if (pct >= 50) {
      traits.push({ label: "Backs your favorite driver often", detail: `${Math.round(pct)}% of your winner picks are your favorite driver.` });
    }
  }

  return traits.slice(0, 2);
}

export function computePredictionPerformance(picks: UserPick[], races: RaceDoc[]): PredictionPerformance {
  const raceById = new Map(races.map((r) => [r.id, r]));

  let winnerCorrect = 0;
  let winnerTotal = 0;
  let slotsCorrect = 0;
  let slotsTotal = 0;
  const errorSamples: number[] = [];
  const recent: PredictionPerformance["recent"] = [];

  for (const pick of picks) {
    const race = raceById.get(pick.raceId);
    if (!race || race.status !== "completed" || !race.results?.length) continue;

    const actualBySlot = new Map(race.results.filter((r) => r.finishPosition <= 3).map((r) => [r.finishPosition, r.driver]));
    const actualByDriver = new Map(race.results.map((r) => [r.driver, r]));

    winnerTotal += 1;
    const winnerCorrectThisRace = actualBySlot.get(1) === pick.predictedWinner;
    if (winnerCorrectThisRace) winnerCorrect += 1;

    let slotsCorrectThisRace = 0;
    pick.predictedPodium.forEach((driver, i) => {
      const slot = i + 1;
      slotsTotal += 1;
      if (actualBySlot.get(slot) === driver) {
        slotsCorrect += 1;
        slotsCorrectThisRace += 1;
      }
      const actual = actualByDriver.get(driver);
      if (actual && actual.status !== "dnf") errorSamples.push(Math.abs(actual.finishPosition - slot));
    });

    recent.push({
      raceId: race.id,
      raceName: race.name,
      round: race.round,
      result: winnerCorrectThisRace ? "winner" : slotsCorrectThisRace > 0 ? "partial" : "miss",
    });
  }

  recent.sort((a, b) => b.round - a.round);

  return {
    winner: { correct: winnerCorrect, total: winnerTotal },
    podiumSlots: { correct: slotsCorrect, total: slotsTotal },
    avgPositionError: errorSamples.length > 0 ? errorSamples.reduce((sum, e) => sum + e, 0) / errorSamples.length : null,
    recent,
  };
}
