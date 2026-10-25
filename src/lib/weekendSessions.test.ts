import { test } from "node:test";
import assert from "node:assert/strict";
import { weekendSessionsFor, withArchiveSprint } from "./weekendSessions";
import type { ArchiveResultEntry } from "./supabase/archive";
import type { RaceDoc } from "./types/race";

const pastRace = {
  id: "2023_r4_azerbaijan",
  year: 2023,
  round: 4,
  name: "Azerbaijan Grand Prix",
  circuit: "Baku",
  status: "completed",
  updatedAt: "2023-04-30",
  results: [{ driver: "PER", driverName: "Sergio Perez", team: "Red Bull", grid: 3, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 25 }],
  inputs: [{ driver: "LEC", driverName: "Charles Leclerc", team: "Ferrari", grid: 1, qualifyingGapSec: 0 }],
  practice: { FP1: { bestLaps: [] } },
} as unknown as RaceDoc;

const winner: ArchiveResultEntry = {
  position: 1, positionText: "1", grid: 2, laps: 17, status: "Finished", points: 8, driverId: "perez", driverName: "Sergio Perez", constructor: "Red Bull", teamId: null, driverCode: "PER",
};
const second: ArchiveResultEntry = { ...winner, position: 2, driverId: "leclerc", driverCode: "LEC", status: "+1 Lap", points: 7 };

test("a past race with no calendar gets tabs for every session it has results for, sprint from the archive", () => {
  const race = withArchiveSprint(pastRace, [winner, second]);
  assert.equal(race.sprintResults?.[1].status, "lapped");
  assert.equal(race.sprintResults?.[0].driver, "PER");
  const sessions = weekendSessionsFor([], race, []);
  assert.deepEqual(sessions.map((s) => s.key), ["FP1", "S", "Q"]);
  assert.ok(sessions.every((s) => s.state === "completed"));
});

test("a stored sprint is kept, and no archive sprint changes nothing", () => {
  assert.equal(withArchiveSprint(pastRace, undefined), pastRace);
  const stored = { ...pastRace, sprintResults: [] as never[] };
  assert.equal(withArchiveSprint(stored, []), stored);
});
