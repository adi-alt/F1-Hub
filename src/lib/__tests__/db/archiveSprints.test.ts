// archive_sprint_results (migration 20261019) on the real schema and every migration: anyone may read it, no client
// role may write it, impossible rows are refused, a re-run updates rather than duplicates, deleting a race removes its
// rows - and archiveScoringResults counts a sprint's points with the Grand Prix's.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, type TestDb } from "./testDb";
import { archiveScoringResults } from "../../supabase/archive";

describe("archive_sprint_results", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    await t.owner(`insert into archive_races (id, year, round, race_name) values ('2025_r06', 2025, 6, 'Miami Grand Prix')`);
    await t.owner(`insert into archive_sprint_results (archive_race_id, driver_id, position, position_text, status, points, driver_name, constructor, driver_code) values ('2025_r06', 'norris', 1, '1', 'Finished', 8, 'Lando Norris', 'McLaren', 'NOR')`);
  });
  after(() => t.close());

  test("anyone can read it; no client role can write it", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      assert.equal((await t.as(role, null, "select * from archive_sprint_results")).length, 1, role);
      await assert.rejects(t.as(role, null, `insert into archive_sprint_results (archive_race_id, driver_id, driver_name, points) values ('2025_r06', 'x', 'X', 1)`), /permission denied/, role);
      await assert.rejects(t.as(role, null, `update archive_sprint_results set points = 99`), /permission denied/, role);
    }
  });

  test("refuses impossible rows and duplicates; a re-run updates", async () => {
    await assert.rejects(t.owner(`insert into archive_sprint_results (archive_race_id, driver_id, driver_name, points) values ('2025_r06', 'a', 'A', -1)`), /check/);
    await assert.rejects(t.owner(`insert into archive_sprint_results (archive_race_id, driver_id, driver_name, position) values ('2025_r06', 'b', 'B', 0)`), /check/);
    await assert.rejects(t.owner(`insert into archive_sprint_results (archive_race_id, driver_id, driver_name) values ('2025_r06', 'norris', 'L')`), /duplicate key/);
    await t.owner(`insert into archive_sprint_results (archive_race_id, driver_id, driver_name, points) values ('2025_r06', 'norris', 'Lando Norris', 8) on conflict (archive_race_id, driver_id) do update set points = excluded.points`);
    assert.equal((await t.owner(`select * from archive_sprint_results`)).length, 1);
  });

  test("deleting the race removes its sprint rows", async () => {
    await t.owner(`delete from archive_races where id = '2025_r06'`);
    assert.equal((await t.owner("select * from archive_sprint_results")).length, 0);
  });
});

test("archiveScoringResults: the Grand Prix plus the sprint, nothing counted twice", () => {
  const e = (driverId: string, points: number) => ({ position: 1, positionText: "1", grid: 1, laps: 1, status: "Finished", points, driverId, driverName: driverId, constructor: "T", teamId: null });
  assert.deepEqual(archiveScoringResults({ results: [e("norris", 25)], sprintResults: [e("norris", 8)] }).map((r) => r.points), [25, 8]);
  assert.equal(archiveScoringResults({ results: [e("norris", 25)] }).length, 1, "no sprint: the Grand Prix only");
});
