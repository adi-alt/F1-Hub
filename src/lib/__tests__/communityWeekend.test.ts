import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comparableDriver, crowdModelRecord, fastestLapDriver, liveSession, modelPickFor, pickWeekend, sessionPhaseAt, sessionResults, sessionsOf } from "../communityWeekend";
import type { RaceDoc } from "../types/race";

const at = (iso: string) => Date.parse(iso);
const austin = {
  year: 2026,
  round: 18,
  name: "United States Grand Prix",
  status: "upcoming",
  sessions: [
    { label: "Practice 1", date: "2026-10-23T17:30:00" },
    { label: "Sprint Qualifying", date: "2026-10-23T21:30:00" },
    { label: "Sprint", date: "2026-10-24T18:00:00" },
    { label: "Qualifying", date: "2026-10-24T22:00:00" },
    { label: "Race", date: "2026-10-25T20:00:00" },
    { label: "Some test session", date: "2026-10-22T10:00:00" },
  ],
};
const mexico = { ...austin, round: 19, name: "Mexico City Grand Prix", sessions: [{ label: "Practice 1", date: "2026-10-30T18:30:00" }, { label: "Race", date: "2026-11-01T20:00:00" }] };
const cancelled = { ...austin, round: 17, name: "Cancelled Grand Prix", status: "cancelled", sessions: [{ label: "Race", date: "2026-10-18T20:00:00" }] };

describe("sessionsOf", () => {
  it("keys and orders the weekend's sessions and drops the ones the site doesn't show", () => {
    assert.deepEqual(sessionsOf(austin).map((s) => s.key), ["FP1", "SQ", "S", "Q", "R"]);
    assert.equal(sessionsOf(austin, { Q: true }).find((s) => s.key === "Q")?.hasData, true);
  });
});

describe("pickWeekend", () => {
  it("is the round whose window holds now: from three days before its first session to 36h after the race", () => {
    assert.equal(pickWeekend([austin, mexico], at("2026-10-21T12:00:00Z"))?.round, 18); // build-up
    assert.equal(pickWeekend([austin, mexico], at("2026-10-26T12:00:00Z"))?.round, 18); // the morning after
  });
  it("is otherwise the next round to come, never a cancelled one", () => {
    assert.equal(pickWeekend([cancelled, austin, mexico], at("2026-10-12T12:00:00Z"))?.round, 18);
    assert.equal(pickWeekend([austin, mexico], at("2026-10-28T12:00:00Z"))?.round, 19);
    assert.equal(pickWeekend([austin], at("2026-12-01T00:00:00Z")), null);
  });
});

describe("sessionPhaseAt", () => {
  const sessions = sessionsOf(austin);
  it("tags a moment with the session it fell in, or the one just before it", () => {
    assert.deepEqual(sessionPhaseAt(sessions, at("2026-10-24T22:30:00Z")), { phase: "live", key: "Q", label: "Qualifying" });
    assert.deepEqual(sessionPhaseAt(sessions, at("2026-10-25T09:00:00Z")), { phase: "after", key: "Q", label: "Qualifying" });
    assert.deepEqual(sessionPhaseAt(sessions, at("2026-10-23T08:00:00Z")), { phase: "build-up" });
  });
  it("is null outside the weekend's window", () => {
    assert.equal(sessionPhaseAt(sessions, at("2026-10-10T12:00:00Z")), null);
    assert.equal(sessionPhaseAt(sessions, at("2026-10-28T12:00:00Z")), null);
    assert.equal(sessionPhaseAt([], at("2026-10-24T22:30:00Z")), null);
  });
  it("finds the live session", () => {
    assert.equal(liveSession(sessions, at("2026-10-25T21:00:00Z"))?.key, "R");
    assert.equal(liveSession(sessions, at("2026-10-25T12:00:00Z")), null);
  });
});

const roster = new Map([
  ["NOR", { name: "Lando Norris", team: "McLaren" }],
  ["VER", { name: "Max Verstappen", team: "Red Bull Racing" }],
  ["LEC", { name: "Charles Leclerc", team: "Ferrari" }],
  ["PIA", { name: "Oscar Piastri", team: "McLaren" }],
]);
const race = {
  id: "2026_r18_united-states-grand-prix",
  year: 2026,
  round: 18,
  name: "United States Grand Prix",
  circuit: "Austin",
  status: "completed",
  updatedAt: "2026-10-25T23:00:00Z",
  practice: { FP1: { session: "FP1", weather: null, bestLaps: [{ driver: "VER", lapTimeSec: 95.5, deltaToBestSec: 0.2 }, { driver: "NOR", lapTimeSec: 95.3, deltaToBestSec: 0 }, { driver: "LEC", lapTimeSec: 95.9, deltaToBestSec: 0.6 }, { driver: "PIA", lapTimeSec: 96.1, deltaToBestSec: 0.8 }] } },
  results: [
    { driver: "LEC", driverName: "Charles Leclerc", team: "Ferrari", grid: 2, finishPosition: 2, finishGapSec: 3.215, status: "finished", fastestLapSec: 97.1, points: 18 },
    { driver: "NOR", driverName: "Lando Norris", team: "McLaren", grid: 1, finishPosition: 1, finishGapSec: null, status: "finished", fastestLapSec: 97.4, points: 25 },
    { driver: "PIA", driverName: "Oscar Piastri", team: "McLaren", grid: 3, finishPosition: 3, finishGapSec: null, status: "lapped", fastestLapSec: 98.0, points: 15 },
  ],
  poleSitter: "NOR",
  poleTimeSec: 92.8,
  polePrediction: { generatedAt: "", modelVersion: "", featureImportance: {}, order: [{ driver: "VER", team: "Red Bull Racing", predictedQualiPosition: 2, predictedScore: 0 }, { driver: "NOR", team: "McLaren", predictedQualiPosition: 1, predictedScore: 0 }] },
  simulation: { generatedAt: "", modelVersion: "", drivers: [{ driver: "VER", team: "", medianPosition: 2, positionProbabilities: [], p1: 0.31, podium: 0.7, top5: 0.9 }, { driver: "NOR", team: "", medianPosition: 1, positionProbabilities: [], p1: 0.44, podium: 0.8, top5: 0.9 }] },
  prediction: { generatedAt: "", modelVersion: "", finishOrder: [], finishFeatureImportance: {}, backtest: [], predictedPaceGapSec: { NOR: 0.12, LEC: 0.05, VER: 0.3 } },
} as unknown as RaceDoc;

describe("sessionResults", () => {
  it("puts practice in best-lap order with the leader's time and everyone else's gap, names from the roster", () => {
    const r = sessionResults(race, [], roster);
    assert.deepEqual(r.FP1?.map((l) => `${l.position} ${l.code} ${l.name} ${l.detail}`), ["1 NOR Lando Norris 1:35.300", "2 VER Max Verstappen +0.200s", "3 LEC Charles Leclerc +0.600s"]);
  });
  it("puts the race in finishing order, with gaps or the status", () => {
    const r = sessionResults(race, [], roster);
    assert.deepEqual(r.R?.map((l) => `${l.code} ${l.detail}`), ["NOR null", "LEC +3.215s", "PIA Lapped"]);
  });
  it("uses classified qualifying stages, falling back to the pole sitter", () => {
    const stages = [
      { session: "Q" as const, driver: "VER", driverName: "Max Verstappen", team: "Red Bull Racing", position: 2, stages: [93, 92.9, 92.95] as [number, number, number], stageReached: 3 as const, status: "classified" as const, source: "official" as const },
      { session: "Q" as const, driver: "NOR", driverName: "Lando Norris", team: "McLaren", position: 1, stages: [93, 92.9, 92.8] as [number, number, number], stageReached: 3 as const, status: "classified" as const, source: "official" as const },
    ];
    assert.deepEqual(sessionResults(race, stages, roster).Q?.map((l) => `${l.position} ${l.code} ${l.detail}`), ["1 NOR 1:32.800", "2 VER 1:32.950"]);
    assert.deepEqual(sessionResults(race, [], roster).Q?.map((l) => l.code), ["NOR"]);
  });
  it("shows no race result until the race is completed", () => {
    assert.equal(sessionResults({ ...race, status: "upcoming" } as RaceDoc, [], roster).R, undefined);
  });
});

describe("model picks and the crowd-vs-model record", () => {
  it("picks pole from the pole model, the winner from the race model (else the simulation), the fastest lap from the pace gaps", () => {
    assert.deepEqual(modelPickFor("pole", race), { driver: "NOR", chance: null, source: "pole-model" });
    // No predicted finishing order on this race: the simulation's favourite stands in.
    assert.deepEqual(modelPickFor("winner", race), { driver: "NOR", chance: 0.44, source: "simulation" });
    const withOrder = { ...race, prediction: { ...race.prediction, finishOrder: [{ driver: "LEC", team: "Ferrari", predictedPosition: 1, predictedScore: 0, spread: null }, { driver: "NOR", team: "McLaren", predictedPosition: 2, predictedScore: 0, spread: null }] } } as unknown as RaceDoc;
    assert.deepEqual(modelPickFor("winner", withOrder), { driver: "LEC", chance: null, source: "race-model" });
    assert.equal(modelPickFor("podium", race)?.driver, "NOR");
    assert.equal(modelPickFor("fastest_lap", race)?.driver, "LEC");
    assert.equal(modelPickFor("dnf_count", race), null);
    assert.equal(modelPickFor("winner", null), null);
  });
  it("reads the fastest lap holder from the results", () => {
    assert.equal(fastestLapDriver(race), "LEC");
  });
  it("compares on one driver: the guess itself, or a podium's winner slot", () => {
    assert.equal(comparableDriver("podium", ["NOR", "LEC", "PIA"]), "NOR");
    assert.equal(comparableDriver("pole", "VER"), "VER");
    assert.equal(comparableDriver("dnf_count", 3), null);
  });
  it("counts only settled rounds where both the crowd and the model had a pick", () => {
    const rec = crowdModelRecord([
      { groupId: "a", crowd: "NOR", model: "NOR", answer: "NOR" },
      { groupId: "a", crowd: "VER", model: "NOR", answer: "NOR" },
      { groupId: "a", crowd: "LEC", model: "VER", answer: "LEC" },
      { groupId: "a", crowd: "LEC", model: null, answer: "LEC" },
      { groupId: "a", crowd: "LEC", model: "VER", answer: null },
    ]);
    assert.deepEqual(rec, { crowd: 2, model: 2, rounds: 3 });
  });
});
