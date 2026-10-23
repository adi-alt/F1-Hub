import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeasonScorecard } from "./seasonScorecard";
import { computePredictionPerformance } from "./predictionPerformance";
import type { RaceDoc, RaceResultEntry, UserPick } from "@/lib/types/race";

const result = (driver: string, finishPosition: number): RaceResultEntry => ({ driver, driverName: driver, team: "T", grid: finishPosition, finishPosition, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 0 });
const race = (round: number, status: RaceDoc["status"], winners: string[] = []): RaceDoc => ({
  id: `2026_r${round}`,
  year: 2026,
  round,
  name: `Round ${round}`,
  circuit: `c${round}`,
  status,
  updatedAt: "",
  results: winners.map((d, i) => result(d, i + 1)),
  prediction: { finishOrder: ["VER", "NOR", "HAM"].map((driver, i) => ({ driver, predictedPosition: i + 1 })) } as RaceDoc["prediction"],
});
const pick = (raceId: string, podium: [string, string, string]): UserPick => ({ raceId, predictedWinner: podium[0], predictedPodium: podium, submittedAt: "" });

const races = [race(1, "completed", ["VER", "NOR", "HAM"]), race(2, "completed", ["NOR", "VER", "HAM"]), race(3, "upcoming")];
const mine = [pick("2026_r1", ["VER", "NOR", "HAM"]), pick("2026_r3", ["LEC", "VER", "NOR"])];
const everyone = [...mine, pick("2026_r1", ["NOR", "VER", "HAM"]), pick("2026_r1", ["NOR", "HAM", "VER"])];

test("each race shows your pick, the model's, the consensus and the actual winner", () => {
  const { rows } = buildSeasonScorecard(races, mine, everyone);
  assert.deepEqual(rows.map((r) => [r.round, r.status]), [[1, "scored"], [2, "scored"], [3, "pending"]]);
  const r1 = rows[0];
  assert.equal(r1.yourWinner, "VER");
  assert.equal(r1.modelWinner, "VER");
  assert.equal(r1.consensusWinner, "NOR");
  assert.equal(r1.consensusShare, 2 / 3);
  assert.equal(r1.actualWinner, "VER");
  assert.equal(r1.yourPoints, 9);
  assert.equal(rows[1].yourWinner, null); // a missed race is a gap, not a zero
  assert.equal(rows[1].yourPoints, null);
});

test("the totals are the profile overview's (and the leaderboards') points", () => {
  const { totals } = buildSeasonScorecard(races, mine, everyone);
  const perf = computePredictionPerformance(mine, races);
  assert.equal(totals.yourPoints, perf.points.earned);
  assert.equal(totals.racesScored, perf.points.races);
  assert.equal(totals.winnersRight, 1);
});
