import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHighlights } from "./highlights";
import type { RaceDoc, RaceResultEntry } from "@/lib/types/race";

function row(partial: Partial<RaceResultEntry> & { driver: string; grid: number; finishPosition: number }): RaceResultEntry {
  return {
    driverName: partial.driver,
    team: "Team",
    finishGapSec: 1,
    status: "finished",
    fastestLapSec: null,
    points: 0,
    ...partial,
  };
}

test("computeHighlights returns null for a race with no stored results", () => {
  const race: RaceDoc = {
    id: "x",
    year: 2026,
    round: 1,
    circuit: "x",
    name: "X",
    status: "upcoming",
    updatedAt: "",
  };
  assert.equal(computeHighlights(race), null);
});

test("computeHighlights finds podium, fastest lap, and biggest mover", () => {
  const race: RaceDoc = {
    id: "2026_x",
    year: 2026,
    round: 1,
    circuit: "x",
    name: "X",
    status: "completed",
    poleSitter: "NOR",
    poleTimeSec: 80,
    results: [
      row({ driver: "NOR", grid: 1, finishPosition: 1, fastestLapSec: 82.1 }),
      row({ driver: "VER", grid: 15, finishPosition: 2, fastestLapSec: 81.5 }), // biggest gainer: +13
      row({ driver: "LEC", grid: 2, finishPosition: 3 }),
      row({ driver: "HAM", grid: 3, finishPosition: 18, status: "finished" }), // biggest loser: -15
      row({ driver: "PIA", grid: 4, finishPosition: 20, status: "dnf" }),
    ],
    updatedAt: "",
  };

  const highlights = computeHighlights(race)!;
  assert.equal(highlights.poleSitter, "NOR");
  assert.deepEqual(
    highlights.podium.map((p) => p.driver),
    ["NOR", "VER", "LEC"],
  );
  assert.equal(highlights.fastestLap?.driver, "VER");
  assert.deepEqual(highlights.biggestGainer, { driver: "VER", positionsGained: 13 });
  assert.deepEqual(highlights.biggestLoser, { driver: "HAM", positionsLost: 15 });
  assert.deepEqual(
    highlights.dnfs.map((d) => d.driver),
    ["PIA"],
  );
});
