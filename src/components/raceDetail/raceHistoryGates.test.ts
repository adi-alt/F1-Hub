import { test } from "node:test";
import assert from "node:assert/strict";
import { hasGrandPrixHistory } from "./GrandPrixHistorySection";
import { hasCircuitRecords } from "./CircuitRecordsSection";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { AgeRecords } from "@/lib/circuitRecords";

const emptyAgeRecords: AgeRecords = { youngestWinner: null, oldestWinner: null, youngestPoleSitter: null, oldestPoleSitter: null };

function record(overrides: Partial<CircuitYearRecord> & { year: number }): CircuitYearRecord {
  return {
    winnerDriver: null,
    winnerTeam: null,
    winnerGrid: null,
    winnerCode: null,
    winnerArchiveDriverId: null,
    poleSitter: null,
    poleCode: null,
    poleArchiveDriverId: null,
    winnerWasPole: null,
    winningMarginSec: null,
    fieldMovementAvg: null,
    dryRace: null,
    avgTempC: null,
    raceName: null,
    raceDateIso: null,
    fastestLapSec: null,
    fastestLapDriver: null,
    fastestLapCode: null,
    ...overrides,
  };
}

// RaceHistorySection only offers a tab when its content would render something real - these gates
// are what decide that, so a wrong answer here means either an empty tab a click reveals nothing
// behind, or a real tab silently missing.

test("hasGrandPrixHistory is false for an empty timeline", () => {
  assert.equal(hasGrandPrixHistory("Bahrain Grand Prix", []), false);
});

test("hasGrandPrixHistory is true once this exact Grand Prix has a classified year", () => {
  const timeline = [record({ year: 2024, raceName: "Bahrain Grand Prix", winnerDriver: "Max Verstappen" })];
  assert.equal(hasGrandPrixHistory("Bahrain Grand Prix", timeline), true);
});

test("hasGrandPrixHistory is false when the circuit's only history is a DIFFERENT Grand Prix identity", () => {
  // Imola's real case: a circuit with real history, but none of it under THIS race's own name.
  const timeline = [record({ year: 2019, raceName: "San Marino Grand Prix", winnerDriver: "A" }), record({ year: 2020, raceName: "San Marino Grand Prix", winnerDriver: "B" })];
  assert.equal(hasGrandPrixHistory("Emilia Romagna Grand Prix", timeline), false);
});

test("hasCircuitRecords is false with nothing resolvable at all", () => {
  assert.equal(hasCircuitRecords([], [], [], emptyAgeRecords), false);
});

test("hasCircuitRecords is true once even one real age record resolves, with no lap/podium data", () => {
  const timeline = [record({ year: 2024 })];
  const ages: AgeRecords = { ...emptyAgeRecords, youngestWinner: { driver: "Max Verstappen", age: 18, year: 2016 } };
  assert.equal(hasCircuitRecords(timeline, [], [], ages), true);
});
