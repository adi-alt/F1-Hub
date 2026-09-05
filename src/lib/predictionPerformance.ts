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
   * front-row starters, high = regularly backs a grid disadvantage). Kimi interprets this; it never
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
