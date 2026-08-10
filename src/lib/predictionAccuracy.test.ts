import { test } from "node:test";
import assert from "node:assert/strict";
import { comparePolePrediction, comparePrediction } from "./predictionAccuracy";
import type { RaceDoc, RaceResultEntry } from "@/lib/types/race";

function result(driver: string, finishPosition: number): RaceResultEntry {
  return {
    driver,
    driverName: driver,
    team: "Team",
    grid: finishPosition,
    finishPosition,
    finishGapSec: 1,
    status: "finished",
    fastestLapSec: null,
    points: 0,
  };
}

test("comparePrediction pairs each prediction with the SAME driver's actual result, not by array index", () => {
  const race: RaceDoc = {
    id: "2026_x",
    year: 2026,
    round: 1,
    circuit: "x",
    name: "X",
    status: "completed",
    results: [result("VER", 1), result("NOR", 2), result("LEC", 3)],
    prediction: {
      generatedAt: "",
      modelVersion: "v1",
      finishOrder: [
        { driver: "LEC", team: "Ferrari", predictedPosition: 1, predictedScore: 0, spread: null },
        { driver: "VER", team: "Red Bull", predictedPosition: 2, predictedScore: 0, spread: null },
        { driver: "NOR", team: "McLaren", predictedPosition: 3, predictedScore: 0, spread: null },
      ],
      finishFeatureImportance: {},
      predictedPaceGapSec: {},
      backtest: [],
    },
    updatedAt: "",
  };

  const accuracy = comparePrediction(race)!;
  // LEC predicted P1 but actually finished P3 (error 2); VER predicted P2, actual P1 (error 1);
  // NOR predicted P3, actual P2 (error 1). Mean = 4/3, NOT 0 (which a shifted-index bug would give).
  assert.ok(Math.abs(accuracy.positionMAE - 4 / 3) < 1e-9);
  assert.equal(accuracy.predictedWinner, "LEC");
  assert.equal(accuracy.actualWinner, "VER");
  assert.equal(accuracy.podiumHits, 3); // same three drivers, different order, still all podium
});

test("comparePrediction returns null when there's no locked-in prediction", () => {
  const race: RaceDoc = {
    id: "2026_y",
    year: 2026,
    round: 2,
    circuit: "y",
    name: "Y",
    status: "completed",
    results: [result("VER", 1)],
    updatedAt: "",
  };
  assert.equal(comparePrediction(race), null);
});

test("comparePolePrediction reports a hit when the frozen prior-form pick matches the actual pole sitter", () => {
  const race: RaceDoc = {
    id: "2026_z",
    year: 2026,
    round: 3,
    circuit: "z",
    name: "Z",
    status: "completed",
    poleSitter: "VER",
    results: [result("VER", 1)],
    polePrediction: {
      generatedAt: "",
      modelVersion: "v1",
      order: [{ driver: "VER", team: "Red Bull", predictedQualiPosition: 1, predictedScore: 0 }],
      featureImportance: {},
    },
    updatedAt: "",
  };
  const accuracy = comparePolePrediction(race)!;
  assert.equal(accuracy.predictedPole, "VER");
  assert.equal(accuracy.actualPole, "VER");
  assert.equal(accuracy.hit, true);
});

test("comparePolePrediction returns null without a frozen pole prediction", () => {
  const race: RaceDoc = {
    id: "2026_w",
    year: 2026,
    round: 4,
    circuit: "w",
    name: "W",
    status: "completed",
    poleSitter: "VER",
    results: [result("VER", 1)],
    updatedAt: "",
  };
  assert.equal(comparePolePrediction(race), null);
});
