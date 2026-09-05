import { test } from "node:test";
import assert from "node:assert/strict";
import { computePredictionPerformance } from "./predictionPerformance";
import type { RaceDoc, RaceResultEntry, UserPick } from "@/lib/types/race";

function result(driver: string, finishPosition: number, status: RaceResultEntry["status"] = "finished"): RaceResultEntry {
  return { driver, driverName: driver, team: "Team", grid: finishPosition, finishPosition, finishGapSec: 0, status, fastestLapSec: null, points: 0 };
}

function completedRace(round: number, results: RaceResultEntry[]): RaceDoc {
  return { id: `2026_r${round}`, year: 2026, round, name: `Round ${round}`, circuit: `r${round}`, status: "completed", results, updatedAt: "" };
}

function pick(raceId: string, winner: string, podium: [string, string, string]): UserPick {
  return { raceId, predictedWinner: winner, predictedPodium: podium, submittedAt: "" };
}

test("computePredictionPerformance scores winner/slot correctness exactly, and errors only for classified drivers", () => {
  const races = [
    completedRace(1, [result("VER", 1), result("NOR", 2), result("HAM", 3)]),
    completedRace(2, [result("NOR", 1), result("VER", 2), result("HAM", 3, "dnf")]),
  ];
  const picks = [
    pick("2026_r1", "VER", ["VER", "NOR", "HAM"]), // perfect: 3/3 slots, winner correct
    pick("2026_r2", "VER", ["NOR", "HAM", "VER"]), // winner wrong; slot1 (NOR) happens to be correct
  ];

  const perf = computePredictionPerformance(picks, races);
  assert.deepEqual(perf.winner, { correct: 1, total: 2 });
  assert.deepEqual(perf.podiumSlots, { correct: 4, total: 6 });
  // Race 1 errors: all 0 (exact, all classified). Race 2: NOR predicted slot1, actually finished
  // P1 -> error 0; HAM predicted slot2 is a DNF -> excluded; VER predicted slot3, actually
  // finished P2 -> error 1. Five classified samples total: 0,0,0,0,1.
  assert.equal(perf.avgPositionError, 1 / 5);
  assert.deepEqual(
    perf.recent.map((r) => r.result),
    ["partial", "winner"], // sorted most-recent-round first; race 2 got its one slot right
  );
});

test("computePredictionPerformance ignores picks for races that aren't completed yet", () => {
  const races: RaceDoc[] = [{ id: "2026_r1", year: 2026, round: 1, name: "Round 1", circuit: "r1", status: "upcoming", updatedAt: "" }];
  const perf = computePredictionPerformance([pick("2026_r1", "VER", ["VER", "NOR", "HAM"])], races);
  assert.deepEqual(perf.winner, { correct: 0, total: 0 });
  assert.equal(perf.avgPositionError, null);
  assert.deepEqual(perf.recent, []);
});
