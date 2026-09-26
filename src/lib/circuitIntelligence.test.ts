import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCircuitTimeline,
  computeLapRecord,
  computeMostPodiums,
  computeTrackRecords,
  distinctRaceNames,
  filterByRaceName,
  joinNames,
  topByCountAll,
  type CircuitYearRecord,
} from "./circuitIntelligence";
import type { RaceDoc } from "./types/race";
import type { ArchiveRaceDoc } from "./supabase/archive";

// Minimal fixtures - only the fields each function under test actually reads. Cast rather than
// filled out in full: RaceDoc/ArchiveRaceDoc carry many fields no function here touches, and a
// full fixture per case would bury what each test is actually about.
function liveRace(overrides: Partial<RaceDoc> & { year: number }): RaceDoc {
  return {
    id: `live-${overrides.year}`,
    round: 1,
    name: "Test Grand Prix",
    circuit: "Test Circuit",
    country: "Testland",
    status: "completed",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as RaceDoc;
}

function archiveRace(overrides: Partial<ArchiveRaceDoc> & { year: number }): ArchiveRaceDoc {
  return {
    id: `archive-${overrides.year}`,
    round: 1,
    raceName: "Test Grand Prix",
    circuitName: "Test Circuit",
    locality: "Testville",
    country: "Testland",
    raceDate: `${overrides.year}-01-01`,
    wikipediaUrl: null,
    weather: null,
    circuitId: "test-circuit",
    photoUrl: null,
    photoUrls: [],
    ...overrides,
  } as ArchiveRaceDoc;
}

test("joinNames reads as a real sentence, not a delimiter-joined list", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["Max Verstappen"]), "Max Verstappen");
  assert.equal(joinNames(["Max Verstappen", "Lewis Hamilton"]), "Max Verstappen and Lewis Hamilton");
  assert.equal(joinNames(["A", "B", "C"]), "A, B and C");
});

test("topByCountAll returns every tied leader, not just whichever the map iteration saw first", () => {
  assert.equal(topByCountAll([]), null);
  const single = topByCountAll(["A", "A", "B"]);
  assert.deepEqual(single, { names: ["A"], count: 2 });
  const tied = topByCountAll(["A", "B", "A", "B", "C"]);
  assert.deepEqual(tied, { names: ["A", "B"], count: 2 });
});

test("computeTrackRecords surfaces a tie for most wins as multiple drivers, not one", () => {
  const timeline: CircuitYearRecord[] = [
    { year: 2020, winnerDriver: "A" } as CircuitYearRecord,
    { year: 2021, winnerDriver: "B" } as CircuitYearRecord,
    { year: 2022, winnerDriver: "A" } as CircuitYearRecord,
    { year: 2023, winnerDriver: "B" } as CircuitYearRecord,
  ].map((r) => ({ ...r, winnerTeam: null, winnerGrid: null, winnerCode: null, winnerArchiveDriverId: null, poleSitter: null, poleArchiveDriverId: null, winnerWasPole: null, winningMarginSec: null, fieldMovementAvg: null, dryRace: null, avgTempC: null, raceName: null, raceDateIso: null, fastestLapSec: null, fastestLapDriver: null, fastestLapCode: null }));
  const records = computeTrackRecords(timeline);
  assert.deepEqual(records.mostWins, { drivers: ["A", "B"], count: 2 });
});

test("computeLapRecord is the fastest RACE lap, never the pole/qualifying time", () => {
  const timeline: CircuitYearRecord[] = [
    { year: 2020, fastestLapSec: 92.5, fastestLapDriver: "Slow Sam", fastestLapCode: "SAM" },
    { year: 2021, fastestLapSec: 91.2, fastestLapDriver: "Fast Fiona", fastestLapCode: "FIO" },
    { year: 2022, fastestLapSec: null, fastestLapDriver: null, fastestLapCode: null },
  ].map((r) => ({ ...r }) as CircuitYearRecord);
  const record = computeLapRecord(timeline);
  assert.deepEqual(record, { driver: "Fast Fiona", sec: 91.2, year: 2021 });
});

test("computeLapRecord is null when no year in the window has fastest-lap data", () => {
  const timeline: CircuitYearRecord[] = [{ year: 2020, fastestLapSec: null, fastestLapDriver: null } as CircuitYearRecord];
  assert.equal(computeLapRecord(timeline), null);
});

test("distinctRaceNames and filterByRaceName tell a circuit's own history apart from one Grand Prix's", () => {
  // Imola's real case: three distinct Grand Prix identities at the same physical circuit.
  const timeline: CircuitYearRecord[] = [
    { year: 2019, raceName: "San Marino Grand Prix", winnerDriver: "A" },
    { year: 2020, raceName: "Emilia Romagna Grand Prix", winnerDriver: "B" },
    { year: 2021, raceName: "Emilia Romagna Grand Prix", winnerDriver: "B" },
  ].map((r) => ({ ...r }) as CircuitYearRecord);

  assert.deepEqual(distinctRaceNames(timeline), ["San Marino Grand Prix", "Emilia Romagna Grand Prix"]);

  const emiliaOnly = filterByRaceName(timeline, "Emilia Romagna Grand Prix");
  assert.equal(emiliaOnly.length, 2);
  // Never credits San Marino GP's own winner to Emilia Romagna GP's history.
  assert.ok(!emiliaOnly.some((r) => r.year === 2019));
});

test("computeMostPodiums counts every classified top-3 finish, not just wins", () => {
  const races: RaceDoc[] = [
    liveRace({
      year: 2023,
      results: [
        { driver: "A", driverName: "Driver A", team: "Team", grid: 1, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 25 },
        { driver: "B", driverName: "Driver B", team: "Team", grid: 2, finishPosition: 2, finishGapSec: 5, status: "finished", fastestLapSec: null, points: 18 },
        { driver: "C", driverName: "Driver C", team: "Team", grid: 3, finishPosition: 4, finishGapSec: 10, status: "finished", fastestLapSec: null, points: 12 },
      ] as RaceDoc["results"],
    }),
  ];
  const podiums = computeMostPodiums(races, [], 5);
  assert.deepEqual(
    podiums.map((p) => p.driver),
    ["Driver A", "Driver B"],
  );
});

test("computeMostPodiums never double-counts a year both sources cover", () => {
  const live: RaceDoc[] = [
    liveRace({
      year: 2020,
      results: [{ driver: "A", driverName: "Driver A", team: "Team", grid: 1, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 25 }] as RaceDoc["results"],
    }),
  ];
  const archive: ArchiveRaceDoc[] = [
    archiveRace({
      year: 2020,
      results: [{ position: 1, positionText: "1", grid: 1, laps: 50, status: "Finished", points: 25, driverId: "a", driverName: "Driver A", constructor: "Team", teamId: "team" }] as ArchiveRaceDoc["results"],
    }),
  ];
  const podiums = computeMostPodiums(live, archive, 5);
  assert.deepEqual(podiums, [{ driver: "Driver A", podiums: 1 }]);
});

test("buildCircuitTimeline carries the race's own name and date through, for GP-identity filtering downstream", () => {
  const live = [liveRace({ year: 2024, name: "Bahrain Grand Prix", raceDate: "2024-03-02T15:00:00Z", results: [{ driver: "A", driverName: "Driver A", team: "Team", grid: 1, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: 91.2, points: 25 }] as RaceDoc["results"] })];
  const timeline = buildCircuitTimeline(live, []);
  assert.equal(timeline[0].raceName, "Bahrain Grand Prix");
  assert.equal(timeline[0].raceDateIso, "2024-03-02T15:00:00Z");
});
