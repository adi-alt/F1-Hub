// sprint_results and qualifying_results (migrations 20261015, 20261016), on the real schema and every migration:
// anyone may read them, no client role may write them, the constraints reject impossible rows, the primary keys make
// a re-run an update rather than a duplicate, and deleting a race removes its rows.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, type TestDb } from "./testDb";

describe("session tables: sprint_results and qualifying_results", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    await t.owner(`insert into races (id, year, round, name, circuit, status) values ('2026_r17', 2026, 17, 'Singapore Grand Prix', 'Marina Bay', 'completed')`);
    await t.owner(`insert into sprint_results (race_id, driver, driver_name, team, finish_position, status, points, source) values ('2026_r17', 'VER', 'Max Verstappen', 'Red Bull Racing', 1, 'finished', 8, 'official')`);
    await t.owner(
      `insert into qualifying_results (race_id, session, driver, driver_name, team, position, stage1_sec, stage2_sec, stage3_sec, stage_reached, status, source)
       values ('2026_r17', 'Q', 'VER', 'Max Verstappen', 'Red Bull Racing', 1, 93.241, 91.639, 91.373, 3, 'classified', 'official'),
              ('2026_r17', 'SQ', 'VER', 'Max Verstappen', 'Red Bull Racing', 1, 93.477, 92.701, 91.156, 3, 'classified', 'openf1'),
              ('2026_r17', 'Q', 'HAD', 'Isack Hadjar', 'Red Bull Racing', 22, null, null, null, 1, 'no_time', 'official')`,
    );
  });
  after(() => t.close());

  test("anyone can read them", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      assert.equal((await t.as(role, null, "select * from sprint_results")).length, 1, role);
      assert.equal((await t.as(role, null, "select * from qualifying_results")).length, 3, role);
    }
  });

  test("no client role can write them", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(t.as(role, null, `insert into sprint_results (race_id, driver, driver_name, team, finish_position, status) values ('2026_r17', 'NOR', 'N', 'McLaren', 2, 'finished')`), /permission denied/, `${role} insert sprint`);
      await assert.rejects(t.as(role, null, `update qualifying_results set position = 2 where driver = 'VER'`), /permission denied/, `${role} update quali`);
      await assert.rejects(t.as(role, null, `delete from qualifying_results`), /permission denied/, `${role} delete quali`);
    }
  });

  test("the constraints reject impossible rows", async () => {
    const q = (cols: string) => `insert into qualifying_results (race_id, session, driver, driver_name, team, stage_reached, source${cols ? ", " + cols.split("=")[0] : ""}) values ('2026_r17', 'Q', 'X${Math.random().toString(36).slice(2, 5)}', 'X', 'T', 1, 'official'${cols ? ", " + cols.split("=")[1] : ""})`;
    await assert.rejects(t.owner(q("stage1_sec=-1")), /check/, "negative lap time");
    await assert.rejects(t.owner(q("stage1_sec='NaN'")), /check/, "NaN lap time");
    await assert.rejects(t.owner(q("status='retired'")), /check/, "unknown status");
    await assert.rejects(t.owner(q("position=0")), /check/, "position 0");
    await assert.rejects(t.owner(`insert into qualifying_results (race_id, session, driver, driver_name, team, stage_reached, source) values ('2026_r17', 'Q3', 'Y', 'Y', 'T', 1, 'official')`), /check/, "unknown session");
    await assert.rejects(t.owner(`insert into qualifying_results (race_id, session, driver, driver_name, team, stage_reached, source) values ('2026_r17', 'Q', 'Z', 'Z', 'T', 4, 'official')`), /check/, "stage 4");
    await assert.rejects(t.owner(`insert into sprint_results (race_id, driver, driver_name, team, finish_position, status, source) values ('2026_r17', 'Q', 'Q', 'T', 3, 'finished', 'guess')`), /check/, "unknown sprint source");
  });

  test("a driver appears once per session: a re-run updates, Q and SQ stay separate", async () => {
    await assert.rejects(t.owner(`insert into qualifying_results (race_id, session, driver, driver_name, team, stage_reached, source) values ('2026_r17', 'Q', 'VER', 'V', 'T', 3, 'official')`), /duplicate key/);
    await t.owner(`insert into qualifying_results (race_id, session, driver, driver_name, team, position, stage_reached, source) values ('2026_r17', 'Q', 'VER', 'Max Verstappen', 'Red Bull Racing', 1, 3, 'official') on conflict (race_id, session, driver) do update set position = excluded.position`);
    const rows = await t.owner<{ session: string }>(`select session from qualifying_results where driver = 'VER' order by session`);
    assert.deepEqual(rows.map((r) => r.session), ["Q", "SQ"]);
  });

  test("deleting a race removes its session rows", async () => {
    await t.owner(`delete from races where id = '2026_r17'`);
    assert.equal((await t.owner("select * from qualifying_results")).length, 0);
    assert.equal((await t.owner("select * from sprint_results")).length, 0);
  });
});
