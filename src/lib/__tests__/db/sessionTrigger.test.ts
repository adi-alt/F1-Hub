// fetch_races_due (migration 20261017): the fetch workflow is started only while a race weekend's data is arriving,
// checked on Singapore 2026's real session times (UTC). And no client role can call the trigger functions.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, type TestDb } from "./testDb";

const SINGAPORE = [
  { label: "Practice 1", date: "2026-10-09T08:30:00" },
  { label: "Sprint Qualifying", date: "2026-10-09T12:30:00" },
  { label: "Sprint", date: "2026-10-10T09:00:00" },
  { label: "Qualifying", date: "2026-10-10T13:00:00" },
  { label: "Race", date: "2026-10-11T12:00:00" },
];

describe("fetch_races_due: race-weekend windows", () => {
  let t: TestDb;
  const due = async (at: string) => (await t.owner<{ due: boolean }>(`select public.fetch_races_due($1::timestamptz) as due`, [at]))[0].due;

  before(async () => {
    t = await createTestDb();
    await t.owner(`insert into calendar (id, year, round, name, sessions, race_date, status) values ($1, 2026, 17, 'Singapore Grand Prix', $2::jsonb, '2026-10-11', 'upcoming')`, ["2026_r17", JSON.stringify(SINGAPORE)]);
    await t.owner(`insert into calendar (id, year, round, name, sessions, race_date, status) values ($1, 2026, 18, 'Cancelled GP', $2::jsonb, '2026-10-25', 'cancelled')`, ["2026_r18", JSON.stringify([{ label: "Race", date: "2026-10-25T12:00:00" }])]);
  });
  after(() => t.close());

  test("nothing between weekends", async () => {
    assert.equal(await due("2026-10-01T12:00:00Z"), false);
    assert.equal(await due("2026-10-09T07:00:00Z"), false, "the morning before FP1");
  });

  test("every tick during a session and for 3 hours after it", async () => {
    assert.equal(await due("2026-10-09T08:30:00Z"), true, "FP1 starts");
    assert.equal(await due("2026-10-09T11:15:00Z"), true, "FP1 + 2h45");
    assert.equal(await due("2026-10-09T11:45:00Z"), false, "between FP1's window and sprint qualifying");
    assert.equal(await due("2026-10-09T15:15:00Z"), true, "sprint qualifying + 2h45");
    assert.equal(await due("2026-10-10T14:45:00Z"), true, "during qualifying");
  });

  test("race day until 8 hours after the start", async () => {
    assert.equal(await due("2026-10-11T19:45:00Z"), true, "race + 7h45");
    assert.equal(await due("2026-10-11T20:30:00Z"), false, "race + 8h30: past race day, not the first tick of an hour");
    assert.equal(await due("2026-10-11T21:00:00Z"), true, "race + 9h: the first tick of an hour, the hourly window");
  });

  test("hourly for 3 days after the race, then daily at 06:00 for 21 days", async () => {
    assert.equal(await due("2026-10-12T09:00:00Z"), true, "Monday, first tick of the hour");
    assert.equal(await due("2026-10-12T09:30:00Z"), false, "Monday, not the first tick");
    assert.equal(await due("2026-10-15T06:00:00Z"), true, "day 4, 06:00");
    assert.equal(await due("2026-10-15T07:00:00Z"), false, "day 4, not 06:00");
    assert.equal(await due("2026-10-31T06:05:00Z"), true, "day 20, 06:00 tick");
    assert.equal(await due("2026-11-02T06:00:00Z"), false, "day 22: over");
  });

  test("a cancelled round never triggers", async () => {
    assert.equal(await due("2026-10-25T12:30:00Z"), false);
  });

  test("about 160 runs over a race's whole 26-day window - ~80 on the weekend, 64 hourly, 21 daily - not 2,496", async () => {
    const [{ n }] = await t.owner<{ n: number }>(
      `select count(*)::int as n from generate_series('2026-10-08T00:00:00Z'::timestamptz, '2026-11-03T00:00:00Z'::timestamptz, interval '15 minutes') at where public.fetch_races_due(at)`,
    );
    assert.ok(n > 120 && n < 200, `${n} runs (a flat schedule would be ${26 * 96})`);
  });

  test("no client role can call the trigger functions", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(t.as(role, null, `select public.dispatch_fetch_races()`), /permission denied/, role);
      await assert.rejects(t.as(role, null, `select public.fetch_races_due(now())`), /permission denied/, role);
    }
  });
});
