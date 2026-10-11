// Lap charts read every lap row (audit R-18, DATA-06). PostgREST returns at most 1000 rows per
// request on this project, and a race is ~20 drivers x 50-80 laps, so a single request silently
// dropped the end of most races: the chart stopped short of the flag. 313 of 464 archive races
// have more than 1000 lap rows.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, type Row } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

let races: typeof import("../supabase/races");
let archive: typeof import("../supabase/archive");
let fake: FakeSupabase;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  races = await import("../supabase/races");
  archive = await import("../supabase/archive");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t) });
});

const DRIVERS = Array.from({ length: 20 }, (_, i) => `D${String(i).padStart(2, "0")}`);
const LAPS = 80; // 20 x 80 = 1600 rows, the R-18 acceptance case

function lapRows(raceKey: string, raceId: string, driverKey: string): Row[] {
  return Array.from({ length: LAPS }, (_, lap) =>
    DRIVERS.map((driver, i) => ({ [raceKey]: raceId, lap_number: lap + 1, [driverKey]: driver, position: i + 1, time: `1:3${i % 10}.${String(lap).padStart(3, "0")}` })),
  ).flat();
}

beforeEach(() => {
  fake = new FakeSupabase();
  fake.maxRows = 1000; // the project's db-max-rows
});

describe("lap data completeness (R-18)", () => {
  test("a live-season race with 1600 lap rows returns every lap, final lap included", async () => {
    fake.seed("races", { id: "2026_r12", year: 2026, round: 12 });
    // Shuffled, so the result can't depend on insertion order.
    fake.seed("race_laps", ...lapRows("race_id", "2026_r12", "driver").reverse());
    const laps = await races.getRaceLaps(2026, 12);
    assert.equal(laps.length, LAPS);
    assert.deepEqual(laps.map((l) => l.lap), Array.from({ length: LAPS }, (_, i) => i + 1));
    for (const lap of laps) assert.equal(lap.timings.length, DRIVERS.length, `lap ${lap.lap}`);
    assert.equal(laps.at(-1)!.timings.find((t) => t.driverId === "D19")?.position, 20);
  });

  test("an archive race with 1600 lap rows returns every lap, final lap included", async () => {
    fake.seed("archive_races", { id: "2019_12", year: 2019, round: 12 });
    fake.seed("archive_laps", ...lapRows("archive_race_id", "2019_12", "driver_id").reverse());
    const laps = await archive.getArchiveRaceLaps(2019, 12);
    assert.equal(laps.length, LAPS);
    for (const lap of laps) assert.equal(lap.timings.length, DRIVERS.length, `lap ${lap.lap}`);
  });

  test("no rows is an empty chart, not an error", async () => {
    fake.seed("races", { id: "2026_r16", year: 2026, round: 16 });
    assert.deepEqual(await races.getRaceLaps(2026, 16), []);
  });
});
