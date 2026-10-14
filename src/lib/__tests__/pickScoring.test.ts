import { it } from "node:test";
import assert from "node:assert/strict";
import { MAX_PICK_POINTS, scorePick } from "../pickScoring";
import type { RaceDoc, RaceResultEntry } from "../types/race";

const r = (finishPosition: number, driver: string, extra: Partial<RaceResultEntry> = {}): RaceResultEntry => ({
  driver, driverName: driver, team: "", grid: null, finishPosition, finishGapSec: null, status: "finished", fastestLapSec: 95 + finishPosition, points: 0, ...extra,
});

// ANT wins from RUS (1.4s) and LEC; VER has the fastest lap; RUS on pole; one safety car.
const race = {
  id: "2026_r18", status: "completed", poleSitter: "RUS", safetyCarPeriods: 1,
  results: [r(1, "ANT"), r(2, "RUS", { finishGapSec: 1.4 }), r(3, "LEC"), r(4, "HAM"), r(5, "VER", { fastestLapSec: 94 }), r(6, "NOR"), r(7, "PIA")],
} as unknown as RaceDoc;

// The expected totals are compute_group_scores.score_pick's own on the same race (13, 9 and 0).
it("scores a pick exactly as the pipeline does", () => {
  const s = scorePick(
    { predictedPodium: ["RUS", "ANT", "LEC"], predictedPole: "RUS", predictedFastestLap: "NOR", predictedTop5: ["ANT", "RUS", "LEC", "NOR", "PIA"], predictedSafetyCar: true, predictedMargin: "2_5" },
    race,
  );
  assert.equal(s.earned, 13);
  assert.deepEqual(
    s.categories.map((c) => [c.category, c.earned]),
    [["podium", 5], ["pole", 3], ["fastestLap", 0], ["top5", 3], ["safetyCar", 2], ["margin", 0]],
  );
  assert.equal(s.categories[0].detail, "P3 exact, P1 and P2 on the podium");
  assert.equal(scorePick({ predictedPodium: ["ANT", "RUS", "LEC"] }, race).earned, 9);
  assert.equal(scorePick({ predictedPodium: ["NOR", "PIA", "VER"], predictedSafetyCar: false }, race).earned, 0);
});

it("before the result: what each pick can still earn", () => {
  const upcoming = { ...race, status: "scheduled" } as RaceDoc;
  const s = scorePick({ predictedPodium: ["ANT", "RUS", "LEC"], predictedPole: "RUS", predictedSafetyCar: false }, upcoming);
  assert.equal(s.scored, false);
  assert.equal(s.possible, 9 + 3 + 2);
  assert.deepEqual(s.categories.map((c) => c.outcome), ["pending", "pending", "unpicked", "unpicked", "pending", "unpicked"]);
  assert.equal(MAX_PICK_POINTS, 23);
});
