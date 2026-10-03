// Sprint points in the championship (audit R-17). The standings used to sum Grand Prix points
// only, so every 2026 sprint was missing from them: 180 points across 12 drivers after round 15.
// Sprint points count towards both championships; wins and podiums stay Grand Prix only.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, type Row } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";
import { computeStandings } from "../standings";
import { computeChampionshipProgression, computeConstructorChampionshipProgression } from "../championshipProgression";
import type { RaceDoc, RaceResultEntry, SprintResultEntry } from "@/lib/types/race";

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

const result = (driver: string, team: string, finishPosition: number, points: number): RaceResultEntry => ({
  driver, driverName: driver, team, grid: finishPosition, finishPosition, finishGapSec: finishPosition === 1 ? 0 : 1, status: "finished", fastestLapSec: null, points,
});
const sprintResult = (driver: string, team: string, finishPosition: number, points: number): SprintResultEntry => ({
  driver, driverName: driver, team, grid: finishPosition, finishPosition, finishGapSec: finishPosition === 1 ? 0 : 1, status: "finished", points,
});
const race = (round: number, status: RaceDoc["status"], results: RaceResultEntry[] | undefined, sprintResults?: SprintResultEntry[]): RaceDoc => ({
  id: `2026_r${round}`, year: 2026, round, circuit: `r${round}`, name: `Round ${round}`, status, results, sprintResults, updatedAt: "",
});

describe("computeStandings with sprints", () => {
  const season: RaceDoc[] = [
    race(1, "completed", [result("RUS", "Mercedes", 1, 25), result("NOR", "McLaren", 2, 18)]),
    race(2, "completed", [result("NOR", "McLaren", 1, 25), result("RUS", "Mercedes", 2, 18)], [sprintResult("RUS", "Mercedes", 1, 8), sprintResult("NOR", "McLaren", 2, 7)]),
  ];

  test("sprint points count for drivers and constructors; wins and podiums stay Grand Prix only", () => {
    const { drivers, constructors } = computeStandings(season);
    assert.deepEqual(
      drivers.map((d) => [d.driver, d.points, d.wins, d.podiums]),
      [["RUS", 51, 1, 2], ["NOR", 50, 1, 2]],
    );
    assert.deepEqual(
      constructors.map((c) => [c.team, c.points, c.wins]),
      [["Mercedes", 51, 1], ["McLaren", 50, 1]],
    );
  });

  test("a sprint counts as soon as it is classified, before that weekend's Grand Prix", () => {
    const saturday = [...season, race(3, "upcoming", undefined, [sprintResult("NOR", "McLaren", 1, 8), sprintResult("RUS", "Mercedes", 3, 6)])];
    const { drivers } = computeStandings(saturday);
    assert.deepEqual(
      drivers.map((d) => [d.driver, d.points, d.wins]),
      [["NOR", 58, 1], ["RUS", 57, 1]],
    );
  });
});

describe("championship progression with sprints", () => {
  test("a sprint weekend's sprint points land in that round, for drivers and teams", () => {
    const season = [
      race(1, "completed", [result("RUS", "Mercedes", 1, 25)]),
      race(2, "completed", [result("RUS", "Mercedes", 3, 15)], [sprintResult("RUS", "Mercedes", 1, 8)]),
    ];
    assert.deepEqual(computeChampionshipProgression(season, ["RUS"]).map((row) => row.RUS), [25, 48]);
    assert.deepEqual(computeConstructorChampionshipProgression(season, ["Mercedes"]).map((row) => row.Mercedes), [25, 48]);
    assert.equal(computeChampionshipProgression(season, ["RUS"])[1]["RUS__finishPosition"], 3, "finish position is still the Grand Prix's");
  });
});

describe("loading sprint results with a race", () => {
  let races: typeof import("../supabase/races");
  let fake: FakeSupabase;
  before(async () => {
    const { supabaseAdmin } = await import("../supabase/admin");
    races = await import("../supabase/races");
    Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t) });
  });
  beforeEach(() => {
    fake = new FakeSupabase();
  });

  const row = (id: string, round: number, sprint: Row[] | undefined): Row => ({
    id, year: 2026, round, name: id, circuit: "X", status: "completed", updated_at: "2026-09-01T00:00:00Z",
    race_results: [], race_inputs: [], tire_stints: [], ...(sprint ? { sprint_results: sprint } : {}),
  });
  const stored = (driver: string, position: number, points: number, source: string): Row => ({
    driver, driver_name: driver, team: "Mercedes", grid: position, finish_position: position, finish_gap_sec: null, status: "finished", points, source,
  });

  test("maps the embedded sprint_results and says whether it is still preliminary", async () => {
    fake.seed(
      "races",
      row("2026_r12_dutch-grand-prix", 12, [stored("RUS", 1, 8, "official"), stored("ANT", 2, 7, "official")]),
      row("2026_r17_singapore-grand-prix", 17, [stored("RUS", 1, 8, "openf1_preliminary")]),
      row("2026_r15_azerbaijan-grand-prix", 15, []),
      row("2026_r14_spanish-grand-prix", 14, undefined),
    );
    const byId = new Map((await races.getRacesByYear(2026)).map((r) => [r.id, r]));
    const dutch = byId.get("2026_r12_dutch-grand-prix")!;
    assert.deepEqual(dutch.sprintResults?.map((s) => [s.driver, s.finishPosition, s.points]), [["RUS", 1, 8], ["ANT", 2, 7]]);
    assert.equal(dutch.sprintSource, "official");
    assert.equal(byId.get("2026_r17_singapore-grand-prix")!.sprintSource, "openf1_preliminary");
    assert.equal(byId.get("2026_r15_azerbaijan-grand-prix")!.sprintResults, undefined, "no sprint that weekend");
    assert.equal(byId.get("2026_r14_spanish-grand-prix")!.sprintResults, undefined, "a row without the embed at all");
  });
});
