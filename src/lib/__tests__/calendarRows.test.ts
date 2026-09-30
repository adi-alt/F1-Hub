// Calendar readers after M0 Batch 3: sync_calendar.py retires an event that leaves the upstream
// schedule (status "cancelled", never deleted), so one round can hold a retired row next to the live
// event that replaced it. Readers must show one row per round - the live one - and a retired event
// must never be promoted into a race that predictions can be opened on.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, type Row } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

let calendar: typeof import("../supabase/calendar");
let races: typeof import("../supabase/races");
let fake: FakeSupabase;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  calendar = await import("../supabase/calendar");
  races = await import("../supabase/races");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t) });
});

const cal = (id: string, round: number, status: string | null, over: Row = {}): Row => ({
  id, year: 2026, round, name: id, circuit: "X", country: "X", event_format: "conventional", sessions: [], weather_forecast: null, race_date: "2026-10-11", status, ...over,
});

beforeEach(() => {
  fake = new FakeSupabase();
  // Columns/embeds the real insert would return that toRaceDoc reads.
  fake.defaults.races = () => ({ race_results: [], race_inputs: [], tire_stints: [], updated_at: "2026-10-01T00:00:00Z" });
  fake.seed(
    "calendar",
    cal("2026_r16_bahrain-grand-prix", 16, "cancelled"), // retired: left the schedule
    cal("2026_r17_singapore-grand-prix", 16, "upcoming"), // renumbered into round 16, kept its id
    cal("2026_r23_abu-dhabi-grand-prix", 23, "cancelled"), // cancelled, nothing replaced it
    cal("2026_r22_qatar-grand-prix", 22, null), // older row without a status: live
  );
});

describe("oneRowPerRound", () => {
  test("the live row wins a shared round; a lone cancelled round stays visible as cancelled", () => {
    const rows = calendar.oneRowPerRound(fake.rows("calendar") as { round: number; status: string | null; id: string }[]);
    assert.deepEqual(rows.map((r) => `${r.round}:${r.id}`), ["16:2026_r17_singapore-grand-prix", "23:2026_r23_abu-dhabi-grand-prix", "22:2026_r22_qatar-grand-prix"]);
  });

  test("order does not matter, and duplicates of older data collapse to one", () => {
    const rows = calendar.oneRowPerRound([
      { id: "b", round: 5, status: "upcoming" },
      { id: "a", round: 5, status: "cancelled" },
      { id: "c", round: 5, status: "upcoming" },
    ]);
    assert.deepEqual(rows.map((r) => r.id), ["b"]);
  });
});

describe("calendar readers", () => {
  test("getCalendarEntry returns the live row for a round that also holds a retired one (it used to error)", async () => {
    const entry = await calendar.getCalendarEntry(2026, 16);
    assert.equal(entry?.id, "2026_r17_singapore-grand-prix");
    assert.equal(entry?.status, "upcoming");
  });

  test("getCalendarEntry still reports a genuinely cancelled round", async () => {
    assert.equal((await calendar.getCalendarEntry(2026, 23))?.status, "cancelled");
  });

  test("getCalendarEntriesByYear has one entry per round", async () => {
    const rounds = (await calendar.getCalendarEntriesByYear(2026)).map((e) => e.round);
    assert.deepEqual([...rounds].sort((a, b) => a - b), [16, 22, 23]);
  });
});

describe("promoteCalendarRace", () => {
  test("a retired event is never promoted into a race", async () => {
    assert.equal(await races.promoteCalendarRace("2026_r16_bahrain-grand-prix"), null);
    assert.equal(fake.rows("races").length, 0);
  });

  test("a live calendar-only event is promoted under its own id and round", async () => {
    const race = await races.promoteCalendarRace("2026_r17_singapore-grand-prix");
    assert.equal(race?.id, "2026_r17_singapore-grand-prix");
    assert.deepEqual(fake.rows("races").map((r) => [r.id, r.round]), [["2026_r17_singapore-grand-prix", 16]]);
  });
});
