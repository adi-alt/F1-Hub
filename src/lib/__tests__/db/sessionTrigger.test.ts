// fetch_races_due (migrations 20261017, 20261018): the fetch workflow is started per session - every 15 minutes from
// its start to 2 hours after it ends, then hourly to 24 hours after it ends, then never - and never once that
// session's data is stored in final form. Checked on Singapore 2026's real session times (UTC). And no client role
// can call the trigger functions.
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, type TestDb } from "./testDb";

const SINGAPORE = [
  { label: "Practice 1", date: "2026-10-09T08:30:00" }, // ends 09:30
  { label: "Sprint Qualifying", date: "2026-10-09T12:30:00" }, // ends 13:15
  { label: "Sprint", date: "2026-10-10T09:00:00" }, // ends 09:45
  { label: "Qualifying", date: "2026-10-10T13:00:00" }, // ends 14:00
  { label: "Race", date: "2026-10-11T12:00:00" }, // ends 14:00
];
const R = "2026_r17";

describe("fetch_races_due: per session, until its data is stored", () => {
  let t: TestDb;
  const due = async (at: string) => (await t.owner<{ due: boolean }>(`select public.fetch_races_due($1::timestamptz) as due`, [at]))[0].due;

  before(async () => {
    t = await createTestDb();
    await t.owner(`insert into calendar (id, year, round, name, sessions, race_date, status) values ($1, 2026, 17, 'Singapore Grand Prix', $2::jsonb, '2026-10-11', 'upcoming')`, [R, JSON.stringify(SINGAPORE)]);
    await t.owner(`insert into calendar (id, year, round, name, sessions, race_date, status) values ($1, 2026, 18, 'Cancelled GP', $2::jsonb, '2026-10-25', 'cancelled')`, ["2026_r18", JSON.stringify([{ label: "Race", date: "2026-10-25T12:00:00" }])]);
  });
  // Every test starts with nothing stored for the round.
  beforeEach(async () => {
    await t.owner(`delete from races where id = $1`, [R]);
    await t.owner(`insert into races (id, year, round, name, circuit, status) values ($1, 2026, 17, 'Singapore Grand Prix', 'Marina Bay', 'upcoming')`, [R]);
  });
  after(() => t.close());

  test("nothing between weekends or before a session", async () => {
    assert.equal(await due("2026-10-01T12:00:00Z"), false);
    assert.equal(await due("2026-10-09T08:15:00Z"), false, "15 minutes before FP1");
  });

  test("every 15 minutes from the start to 2 hours after the end, then hourly to 24 hours, then never", async () => {
    assert.equal(await due("2026-10-09T08:30:00Z"), true, "FP1 starts");
    assert.equal(await due("2026-10-09T11:15:00Z"), true, "FP1 end + 1h45: still every tick");
    assert.equal(await due("2026-10-11T15:45:00Z"), true, "race end + 1h45: still every tick");
    assert.equal(await due("2026-10-11T16:30:00Z"), false, "race end + 2h30: hourly now, not the first tick of the hour");
    assert.equal(await due("2026-10-11T17:00:00Z"), true, "race end + 3h: the hourly tick");
    assert.equal(await due("2026-10-12T13:00:00Z"), true, "race end + 23h: last hourly tick");
    assert.equal(await due("2026-10-12T15:00:00Z"), false, "race end + 25h: stopped");
    assert.equal(await due("2026-10-15T06:00:00Z"), false, "no daily re-checks any more");
  });

  test("a session's checks stop once its data is stored", async () => {
    assert.equal(await due("2026-10-09T09:45:00Z"), true, "FP1, nothing stored");
    await t.owner(`update races set practice = '{"FP1": {"bestLaps": []}}'::jsonb where id = $1`, [R]);
    assert.equal(await due("2026-10-09T09:45:00Z"), false, "FP1 stored: stop");

    assert.equal(await due("2026-10-09T14:00:00Z"), true, "sprint qualifying, nothing stored");
    await t.owner(`insert into qualifying_results (race_id, session, driver, driver_name, team, position, stage_reached, source) values ($1, 'SQ', 'VER', 'V', 'T', 1, 3, 'openf1')`, [R]);
    assert.equal(await due("2026-10-09T14:00:00Z"), false, "sprint qualifying stored (OpenF1 is its only source): stop");
  });

  test("sprint, qualifying and race keep checking until the OFFICIAL classification is stored", async () => {
    await t.owner(`insert into sprint_results (race_id, driver, driver_name, team, finish_position, status, points, source) values ($1, 'VER', 'V', 'T', 1, 'finished', 8, 'openf1_preliminary')`, [R]);
    assert.equal(await due("2026-10-10T10:30:00Z"), true, "preliminary sprint: keep checking");
    await t.owner(`update sprint_results set source = 'official' where race_id = $1`, [R]);
    assert.equal(await due("2026-10-10T10:30:00Z"), false, "official sprint: stop");

    await t.owner(`insert into qualifying_results (race_id, session, driver, driver_name, team, position, stage_reached, source) values ($1, 'Q', 'VER', 'V', 'T', 1, 3, 'openf1')`, [R]);
    assert.equal(await due("2026-10-10T15:00:00Z"), true, "preliminary qualifying: keep checking");
    await t.owner(`update qualifying_results set source = 'official' where race_id = $1 and session = 'Q'`, [R]);
    assert.equal(await due("2026-10-10T15:00:00Z"), false, "official qualifying: stop");

    await t.owner(`update races set status = 'completed', results_source = 'openf1_preliminary' where id = $1`, [R]);
    assert.equal(await due("2026-10-11T15:00:00Z"), true, "preliminary race result: keep checking");
    await t.owner(`update races set results_source = 'official' where id = $1`, [R]);
    assert.equal(await due("2026-10-11T15:00:00Z"), false, "official race result: stop");
  });

  test("a cancelled round never triggers", async () => {
    assert.equal(await due("2026-10-25T12:30:00Z"), false);
  });

  test("at most ~140 ticks for a whole sprint weekend with nothing stored - and none once it all is", async () => {
    const count = async () =>
      (await t.owner<{ n: number }>(`select count(*)::int as n from generate_series('2026-10-08T00:00:00Z'::timestamptz, '2026-10-20T00:00:00Z'::timestamptz, interval '15 minutes') at where public.fetch_races_due(at)`))[0].n;
    const worst = await count();
    assert.ok(worst > 60 && worst <= 140, `${worst} ticks in the worst case`);
    await t.owner(`update races set practice = '{"FP1": {}}'::jsonb, status = 'completed', results_source = 'official' where id = $1`, [R]);
    await t.owner(`insert into qualifying_results (race_id, session, driver, driver_name, team, position, stage_reached, source) values ($1, 'SQ', 'VER', 'V', 'T', 1, 3, 'openf1'), ($1, 'Q', 'VER', 'V', 'T', 1, 3, 'official')`, [R]);
    await t.owner(`insert into sprint_results (race_id, driver, driver_name, team, finish_position, status, points, source) values ($1, 'VER', 'V', 'T', 1, 'finished', 8, 'official')`, [R]);
    assert.equal(await count(), 0, "everything stored: no runs at all");
  });

  test("no client role can call the trigger functions", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(t.as(role, null, `select public.dispatch_fetch_races()`), /permission denied/, role);
      await assert.rejects(t.as(role, null, `select public.fetch_races_due(now())`), /permission denied/, role);
    }
  });
});
