import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStandings } from "./standings";
import type { RaceDoc, RaceResultEntry } from "@/lib/types/race";

function result(driver: string, team: string, finishPosition: number, points: number): RaceResultEntry {
  return {
    driver,
    driverName: driver,
    team,
    grid: finishPosition,
    finishPosition,
    finishGapSec: finishPosition === 1 ? 0 : 1,
    status: "finished",
    fastestLapSec: null,
    points,
  };
}

function completedRace(round: number, results: RaceResultEntry[]): RaceDoc {
  return {
    id: `2026_r${round}`,
    year: 2026,
    round,
    circuit: `r${round}`,
    name: `Round ${round}`,
    status: "completed",
    results,
    updatedAt: "",
  };
}

test("computeStandings sums points across completed races and tracks wins/podiums", () => {
  const races: RaceDoc[] = [
    completedRace(1, [result("VER", "Red Bull", 1, 25), result("NOR", "McLaren", 2, 18)]),
    completedRace(2, [result("NOR", "McLaren", 1, 25), result("VER", "Red Bull", 2, 18)]),
  ];

  const standings = computeStandings(races);
  assert.deepEqual(
    standings.drivers.map((d) => [d.driver, d.points, d.wins, d.podiums]),
    [
      ["VER", 43, 1, 2],
      ["NOR", 43, 1, 2],
    ],
  );
  assert.deepEqual(
    standings.constructors.map((c) => [c.team, c.points]),
    [
      ["Red Bull", 43],
      ["McLaren", 43],
    ],
  );
});

test("computeStandings ignores upcoming races entirely", () => {
  const upcoming: RaceDoc = {
    id: "2026_r3",
    year: 2026,
    round: 3,
    circuit: "r3",
    name: "Round 3",
    status: "upcoming",
    inputs: [{ driver: "VER", driverName: "VER", team: "Red Bull", grid: 1, qualifyingGapSec: 0 }],
    updatedAt: "",
  };
  const standings = computeStandings([upcoming]);
  assert.deepEqual(standings.drivers, []);
});
