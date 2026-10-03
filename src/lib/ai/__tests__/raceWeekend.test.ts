// Ask Apex's race facts. Before the race it was given only the circuit's history, and after it
// only the podium, so "how did Lewis do in practice and qualifying" got "I don't have that" on a
// page showing all of it.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { archiveRaceFacts, raceWeekendFacts } from "../context/raceWeekend";
import type { RaceDoc } from "@/lib/types/race";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";

const base: RaceDoc = { id: "2026_r16_bahrain-grand-prix", year: 2026, round: 16, name: "Bahrain Grand Prix", circuit: "Kuala Lumpur", status: "upcoming", updatedAt: "2026-10-03T11:30:00Z" };

const weekend: RaceDoc = {
  ...base,
  practice: {
    FP1: {
      session: "FP1",
      weather: null,
      bestLaps: [
        { driver: "HAM", lapTimeSec: 98.59, deltaToBestSec: 1.07 },
        { driver: "NOR", lapTimeSec: 97.52, deltaToBestSec: 0 },
      ],
    },
    FP3: { session: "FP3", weather: null, bestLaps: [{ driver: "HAM", lapTimeSec: 97.041, deltaToBestSec: 0 }] },
  },
  inputs: [
    { driver: "HAM", driverName: "Lewis Hamilton", team: "Ferrari", grid: 2, qualifyingGapSec: 0.298 },
    { driver: "NOR", driverName: "Lando Norris", team: "McLaren", grid: 1, qualifyingGapSec: 0 },
  ],
  poleSitter: "NOR",
  poleTimeSec: 95.123,
  polePrediction: { generatedAt: "", modelVersion: "", featureImportance: {}, order: [{ driver: "NOR", team: "McLaren", predictedQualiPosition: 1, predictedScore: 0.9 }] },
  simulation: {
    generatedAt: "",
    modelVersion: "",
    drivers: [
      { driver: "HAM", team: "Ferrari", medianPosition: 3, positionProbabilities: [], p1: 0.21, podium: 0.6, top5: 0.8 },
      { driver: "NOR", team: "McLaren", medianPosition: 1, positionProbabilities: [], p1: 0.44, podium: 0.81, top5: 0.9 },
    ],
  },
  weather: { airTempC: 31.4, trackTempC: 44.6, humidityPct: 70.2, rainfall: false },
};

describe("raceWeekendFacts", () => {
  it("has the weekend so far before the race: practice, the grid, the model, the weather", () => {
    const facts = raceWeekendFacts(weekend)!;
    assert.deepEqual(facts.drivers, ["HAM Lewis Hamilton (Ferrari)", "NOR Lando Norris (McLaren)"]);
    assert.deepEqual(facts.practice?.FP1, ["P1 NOR 1:37.520", "P2 HAM 1:38.590 +1.070"]);
    assert.deepEqual(facts.practice?.FP3, ["P1 HAM 1:37.041"]);
    assert.equal(facts.practice?.FP2, undefined, "a session with no data isn't invented");
    assert.deepEqual(facts.qualifying, { pole: "NOR 1:35.123", grid: ["P1 NOR", "P2 HAM +0.298s to pole"] });
    assert.deepEqual(facts.model?.winAndPodiumChance, ["NOR win 44%, podium 81%", "HAM win 21%, podium 60%"]);
    assert.deepEqual(facts.model?.predictedQualifying, ["1. NOR"]);
    assert.equal(facts.result, undefined);
    assert.equal(facts.weather, "air 31°C, track 45°C, humidity 70%, dry");
  });

  it("has every car's result afterwards, not only the podium", () => {
    const facts = raceWeekendFacts({
      ...base,
      status: "completed",
      resultsSource: "openf1_preliminary",
      results: [
        { driver: "ALB", driverName: "Alex Albon", team: "Williams", grid: 12, finishPosition: 20, finishGapSec: null, status: "dnf", fastestLapSec: null, points: 0 },
        { driver: "HAM", driverName: "Lewis Hamilton", team: "Ferrari", grid: 6, finishPosition: 6, finishGapSec: 20.1, status: "finished", fastestLapSec: null, points: 8 },
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", grid: 3, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 25 },
        { driver: "SAR", driverName: "Logan Sargeant", team: "Williams", grid: 19, finishPosition: 18, finishGapSec: null, status: "lapped", fastestLapSec: null, points: 0 },
      ],
    })!;
    assert.match(facts.result!.source, /^preliminary/);
    assert.deepEqual(facts.result!.classification, ["P1 VER from grid 3, 25 pts", "P6 HAM from grid 6, 8 pts", "P18 SAR from grid 19, 0 pts (lapped)", "DNF ALB from grid 12, 0 pts"]);
    assert.ok(facts.drivers.includes("HAM Lewis Hamilton (Ferrari)"), "names come from the results too");
  });

  it("is nothing for a race with no session data yet", () => {
    assert.equal(raceWeekendFacts(base), null);
  });

  it("stays small: a full weekend of 22 cars is a few KB", () => {
    const codes = Array.from({ length: 22 }, (_, i) => `D${String(i).padStart(2, "0")}`);
    const laps = codes.map((driver, i) => ({ driver, lapTimeSec: 95 + i / 10, deltaToBestSec: i / 10 }));
    const full: RaceDoc = {
      ...weekend,
      practice: { FP1: { session: "FP1", weather: null, bestLaps: laps }, FP2: { session: "FP2", weather: null, bestLaps: laps }, FP3: { session: "FP3", weather: null, bestLaps: laps } },
      inputs: codes.map((driver, i) => ({ driver, driverName: `Driver ${i}`, team: "Team", grid: i + 1, qualifyingGapSec: i / 10 })),
    };
    assert.ok(JSON.stringify(raceWeekendFacts(full)).length < 6_000);
  });
});

describe("archiveRaceFacts", () => {
  const race = {
    id: "2019_12",
    year: 2019,
    round: 12,
    raceName: "Hungarian Grand Prix",
    circuitName: "Hungaroring",
    locality: null,
    country: null,
    raceDate: null,
    results: [
      { position: 2, positionText: "2", grid: 3, laps: 70, status: "Finished", points: 18, driverId: "max_verstappen", driverName: "Max Verstappen", constructor: "Red Bull", teamId: null, driverCode: "VER" },
      { position: 1, positionText: "1", grid: 1, laps: 70, status: "Finished", points: 26, driverId: "hamilton", driverName: "Lewis Hamilton", constructor: "Mercedes", teamId: null, driverCode: "HAM" },
      { position: 19, positionText: "R", grid: 0, laps: 40, status: "Gearbox", points: 0, driverId: "kubica", driverName: "Robert Kubica", constructor: "Williams", teamId: null },
    ],
    qualifying: [
      { position: 2, driverId: "hamilton", driverName: "Lewis Hamilton", constructor: "Mercedes", q1: "1:16.0", q2: "1:15.6", q3: "1:15.0" },
      { position: 1, driverId: "max_verstappen", driverName: "Max Verstappen", constructor: "Red Bull", q1: "1:15.8", q2: "1:15.4", q3: "1:14.5" },
    ],
  } as ArchiveRaceDoc;

  it("has the full classification and the qualifying order, with codes, or ids where there's no code", () => {
    const facts = archiveRaceFacts(race)!;
    assert.deepEqual(facts.result!.classification, ["P1 HAM from grid 1, 26 pts", "P2 VER from grid 3, 18 pts", "DNF (Gearbox) kubica from the pit lane, 0 pts"]);
    assert.deepEqual(facts.qualifying, { pole: "VER 1:14.5", grid: ["P1 VER 1:14.5", "P2 HAM 1:15.0"] });
    assert.ok(facts.drivers.includes("HAM Lewis Hamilton (Mercedes)"));
    assert.equal(facts.practice, undefined);
  });
});
