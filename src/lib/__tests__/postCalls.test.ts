import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callRecord, callSession, describeCall, gradeCall, parseCall, type PostCall } from "../postCalls";
import type { RaceDoc } from "../types/race";

const roster = new Set(["NOR", "PIA", "LEC", "HAM", "VER"]);
const call = (c: Partial<PostCall>): PostCall => ({ kind: "winner", raceId: "r", driver: "NOR", rival: null, threshold: null, locksAt: "2026-10-25T20:00:00Z", ...c });
const finished = {
  status: "completed",
  poleSitter: "LEC",
  safetyCarPeriods: 2,
  results: [
    { driver: "NOR", driverName: "", team: "McLaren", grid: 2, finishPosition: 1, finishGapSec: null, status: "finished", fastestLapSec: 97.5, points: 25 },
    { driver: "LEC", driverName: "", team: "Ferrari", grid: 1, finishPosition: 2, finishGapSec: 1.2, status: "finished", fastestLapSec: 97.1, points: 18 },
    { driver: "PIA", driverName: "", team: "McLaren", grid: 3, finishPosition: 3, finishGapSec: 4.0, status: "finished", fastestLapSec: 97.9, points: 15 },
    { driver: "HAM", driverName: "", team: "Ferrari", grid: 4, finishPosition: 18, finishGapSec: null, status: "dnf", fastestLapSec: null, points: 0 },
    { driver: "VER", driverName: "", team: "Red Bull Racing", grid: 5, finishPosition: 19, finishGapSec: null, status: "dnf", fastestLapSec: null, points: 0 },
  ],
} as unknown as RaceDoc;

describe("parseCall", () => {
  it("accepts calls on drivers in the race and refuses everything else", () => {
    assert.deepEqual(parseCall({ kind: "winner", driver: "NOR" }, roster), { call: { kind: "winner", driver: "NOR", rival: null, threshold: null } });
    assert.ok("error" in parseCall({ kind: "winner", driver: "ALO" }, roster));
    assert.ok("error" in parseCall({ kind: "winner", driver: "nor" }, roster));
    assert.ok("error" in parseCall({ kind: "teleport", driver: "NOR" }, roster));
    assert.ok("error" in parseCall(null, roster));
  });
  it("needs two different drivers for a head-to-head and a 1-20 count for retirements", () => {
    assert.ok("error" in parseCall({ kind: "beats_teammate", driver: "NOR", rival: "NOR" }, roster));
    assert.deepEqual(parseCall({ kind: "beats_teammate", driver: "PIA", rival: "NOR" }, roster), { call: { kind: "beats_teammate", driver: "PIA", rival: "NOR", threshold: null } });
    assert.ok("error" in parseCall({ kind: "retirements", threshold: 0 }, roster));
    assert.deepEqual(parseCall({ kind: "retirements", threshold: 3, driver: "NOR" }, roster), { call: { kind: "retirements", driver: null, rival: null, threshold: 3 } });
    assert.deepEqual(parseCall({ kind: "safety_car", driver: "NOR" }, roster), { call: { kind: "safety_car", driver: null, rival: null, threshold: null } });
  });
});

describe("gradeCall", () => {
  it("is pending until the settling session's result is stored", () => {
    assert.equal(gradeCall(call({}), null).status, "pending");
    assert.equal(gradeCall(call({}), { ...finished, status: "upcoming" } as RaceDoc).status, "pending");
    assert.equal(gradeCall(call({ kind: "pole" }), { ...finished, poleSitter: undefined } as RaceDoc).status, "pending");
  });
  it("grades each kind against the classification", () => {
    assert.equal(gradeCall(call({ kind: "winner", driver: "NOR" }), finished).status, "correct");
    assert.equal(gradeCall(call({ kind: "winner", driver: "LEC" }), finished).status, "incorrect");
    assert.equal(gradeCall(call({ kind: "podium", driver: "PIA" }), finished).status, "correct");
    assert.equal(gradeCall(call({ kind: "pole", driver: "LEC" }), finished).status, "correct");
    assert.equal(gradeCall(call({ kind: "fastest_lap", driver: "LEC" }), finished).status, "correct");
    assert.equal(gradeCall(call({ kind: "beats_teammate", driver: "PIA", rival: "NOR" }), finished).status, "incorrect");
    assert.equal(gradeCall(call({ kind: "beats_teammate", driver: "LEC", rival: "HAM" }), finished).status, "correct");
    assert.equal(gradeCall(call({ kind: "safety_car", driver: null }), finished).status, "correct");
    assert.equal(gradeCall(call({ kind: "retirements", driver: null, threshold: 2 }), finished).status, "correct");
    assert.equal(gradeCall(call({ kind: "retirements", driver: null, threshold: 3 }), finished).status, "incorrect");
  });
  it("voids a call about a driver who isn't in the classification, and marks preliminary results provisional", () => {
    assert.equal(gradeCall(call({ kind: "winner", driver: "ALO" }), finished).status, "void");
    assert.deepEqual(gradeCall(call({}), { ...finished, resultsSource: "openf1_preliminary" } as RaceDoc), { status: "correct", provisional: true });
  });
});

describe("callRecord and wording", () => {
  it("counts only settled calls", () => {
    assert.deepEqual(callRecord([{ status: "correct", provisional: false }, { status: "incorrect", provisional: false }, { status: "pending", provisional: false }, { status: "void", provisional: false }]), { correct: 1, settled: 2 });
  });
  it("says what the call claims and which session settles it", () => {
    const names = (c: string) => ({ NOR: "Norris", PIA: "Piastri" })[c] ?? c;
    assert.equal(describeCall({ kind: "beats_teammate", driver: "PIA", rival: "NOR", threshold: null }, names), "Piastri beats Norris");
    assert.equal(describeCall({ kind: "retirements", driver: null, rival: null, threshold: 1 }), "At least 1 retirement");
    assert.equal(callSession("pole"), "Q");
    assert.equal(callSession("safety_car"), "R");
  });
});
