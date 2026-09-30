// The pipeline's SQL contract against the real schema (M0 Batch 3, ingestion): which rounds the
// fetch gate may pick (pipeline/sql/next_round_candidates.sql - the exact file fetch_races.py runs),
// the one-row-per-event rules of 20261001_race_identity.sql, and lock times that follow the race's
// own live calendar row. The Python side of the same rules is pipeline/test_race_identity.py.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LOCK_TIMES_CTE } from "../../../../scripts/lib/predictionAudit.mjs";
import { createTestDb, type TestDb } from "./testDb";

const ROOT = path.resolve(__dirname, "../../../..");
// psycopg2 named parameter -> PGlite positional. The file must contain no other `%` (psycopg2 would
// treat it as a placeholder), which this also checks.
const CANDIDATES_SQL = (() => {
  const raw = fs.readFileSync(path.join(ROOT, "pipeline/sql/next_round_candidates.sql"), "utf8");
  const sql = raw.replaceAll("%(year)s", "$1");
  assert.ok(!sql.includes("%"), "next_round_candidates.sql must not contain a literal % (psycopg2 placeholder syntax)");
  return sql;
})();

const sessions = (quali: string, race: string) => JSON.stringify([
  { label: "Practice 1", date: "2026-10-09T11:30:00" },
  { label: "Qualifying", date: quali },
  { label: "Race", date: race },
]);

async function raceRow(t: TestDb, id: string, year: number, round: number, status = "upcoming", resultsSource = "official") {
  await t.owner(`insert into races (id, year, round, name, circuit, status, results_source) values ($1, $2, $3, $1, 'X', $4, $5)`, [id, year, round, status, resultsSource]);
}
async function calRow(t: TestDb, id: string, year: number, round: number, status: string | null = "upcoming", s: string | null = sessions("2026-10-10T15:00:00", "2026-10-11T15:00:00")) {
  await t.owner(`insert into calendar (id, year, round, name, status, sessions) values ($1, $2, $3, $1, $4, $5::jsonb)`, [id, year, round, status, s]);
}
const candidates = async (t: TestDb, year: number) =>
  (await t.owner<{ round: number; source: string }>(CANDIDATES_SQL, [year])).map((r) => `${r.round}:${r.source}`);

describe("fetch gate candidates (next_round_candidates.sql)", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    // Finished and official: never a candidate again.
    await raceRow(t, "2026_r14_spanish-grand-prix", 2026, 14, "completed", "official");
    await calRow(t, "2026_r14_spanish-grand-prix", 2026, 14, "completed");
    // Finished but only preliminary: still a candidate (the official upgrade).
    await raceRow(t, "2026_r15_azerbaijan-grand-prix", 2026, 15, "completed", "openf1_preliminary");
    await calRow(t, "2026_r15_azerbaijan-grand-prix", 2026, 15, "completed");
    // DATA-01: calendar only, no races row yet - must be a candidate.
    await calRow(t, "2026_r16_bahrain-grand-prix", 2026, 16);
    // Cancelled calendar event: never a candidate, even if it had a races row.
    await calRow(t, "2026_r17_old-event", 2026, 17, "cancelled");
    await raceRow(t, "2026_r17_old-event", 2026, 17, "scheduled");
    // Renumbered: the races row keeps its original id and round 18; the calendar row (same id) now
    // says round 17. One candidate, at the CURRENT round - not two, and not the stale one.
    await raceRow(t, "2026_r18_singapore-grand-prix", 2026, 18, "upcoming");
    await calRow(t, "2026_r18_singapore-grand-prix", 2026, 17);
    // A races row with no calendar event at all: fetched anyway ("races" source).
    await raceRow(t, "2026_r23_abu-dhabi-grand-prix", 2026, 23, "upcoming");
    // Another season: never mixed in.
    await calRow(t, "2027_r01_australian-grand-prix", 2027, 1);
  });
  after(() => t.close());

  test("includes calendar-only rounds, preliminary results and races without a calendar row, in round order", async () => {
    assert.deepEqual(await candidates(t, 2026), ["15:calendar", "16:calendar", "17:calendar", "23:races"]);
  });

  test("the renumbered event appears once, under its calendar round", async () => {
    const rows = await t.owner<{ round: number }>(CANDIDATES_SQL, [2026]);
    assert.equal(rows.filter((r) => r.round === 17).length, 1);
    assert.ok(!rows.some((r) => r.round === 18));
  });

  test("seasons are separate", async () => {
    assert.deepEqual(await candidates(t, 2027), ["1:calendar"]);
    assert.deepEqual(await candidates(t, 2025), []);
  });

  test("returns sessions and race_date for the Python gate", async () => {
    const [r] = await t.owner<{ sessions: unknown[]; race_date: string | null }>(`select * from (${CANDIDATES_SQL}) c where round = 16`, [2026]);
    assert.equal((r.sessions as { label: string }[]).map((s) => s.label).join(","), "Practice 1,Qualifying,Race");
  });
});

describe("one row per event per season (20261001_race_identity.sql)", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
  });
  after(() => t.close());

  test("race_slug strips the {year}_r{round}_ prefix only", async () => {
    const [r] = await t.owner<{ a: string; b: string }>(`select race_slug('2026_r16_bahrain-grand-prix') a, race_slug('R1') b`);
    assert.deepEqual(r, { a: "bahrain-grand-prix", b: "R1" });
  });

  test("a second races row for the same round, or the same event, is refused", async () => {
    await raceRow(t, "2026_r16_bahrain-grand-prix", 2026, 16);
    await assert.rejects(raceRow(t, "2026_r16_qatar-grand-prix", 2026, 16), /races_year_round_key/);
    await assert.rejects(raceRow(t, "2026_r17_bahrain-grand-prix", 2026, 17), /races_year_event_key/);
    // Same event, other season: fine.
    await raceRow(t, "2025_r16_bahrain-grand-prix", 2025, 16);
  });

  test("the pipeline's repeated upsert converges on one row (idempotent), including a renumber", async () => {
    const upsert = (round: number) =>
      t.owner(`insert into races (id, year, round, name, circuit, status) values ('2026_r20_x-grand-prix', 2026, $1, 'X', 'Sakhir', 'upcoming')
               on conflict (id) do update set round = excluded.round, circuit = excluded.circuit`, [round]);
    await upsert(20);
    await upsert(20);
    await upsert(19); // renumbered upstream: same id, new round
    const rows = await t.owner<{ id: string; round: number }>(`select id, round from races where race_slug(id) = 'x-grand-prix'`);
    assert.deepEqual(rows, [{ id: "2026_r20_x-grand-prix", round: 19 }]);
  });

  test("calendar: a cancelled row does not block the live row that replaced it", async () => {
    await calRow(t, "2026_r05_cancelled-grand-prix", 2026, 5, "cancelled");
    await calRow(t, "2026_r05_replacement-grand-prix", 2026, 5, "upcoming");
    await assert.rejects(calRow(t, "2026_r05_third-grand-prix", 2026, 5, "upcoming"), /calendar_live_year_round_key/);
    await assert.rejects(calRow(t, "2026_r06_replacement-grand-prix", 2026, 6, "upcoming"), /calendar_live_year_event_key/);
    // Null status counts as live (older rows).
    await assert.rejects(calRow(t, "2026_r05_fourth-grand-prix", 2026, 5, null), /calendar_live_year_round_key/);
  });

  test("the guard stops the migration with the offending ids when duplicates already exist", async () => {
    const legacy = await createTestDb({ upTo: "20261001_race_identity.sql" });
    try {
      await raceRow(legacy, "2026_r16_bahrain-grand-prix", 2026, 16);
      await raceRow(legacy, "2026_r16_qatar-grand-prix", 2026, 16);
      const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261001_race_identity.sql"), "utf8");
      await assert.rejects(legacy.db.exec(migration), /2026_r16_bahrain-grand-prix, 2026_r16_qatar-grand-prix|2026_r16_qatar-grand-prix, 2026_r16_bahrain-grand-prix/);
      const idx = await legacy.owner(`select 1 from pg_indexes where indexname = 'races_year_round_key'`);
      assert.equal(idx.length, 0, "no index is created when the guard fails");
    } finally {
      await legacy.close();
    }
  });

  test("re-applying the migration is a no-op", async () => {
    const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261001_race_identity.sql"), "utf8");
    await t.db.exec(migration);
  });
});

describe("lock times follow the race's own live calendar row", () => {
  let t: TestDb;
  const lockOf = async (id: string) => {
    const [r] = await t.owner<{ lock_at: string | null; race_start_at: string | null }>(`select prediction_lock_at($1) lock_at, race_start_at($1) race_start_at`, [id]);
    return { lockAt: r.lock_at ? new Date(r.lock_at).toISOString() : null, raceStart: r.race_start_at ? new Date(r.race_start_at).toISOString() : null };
  };
  before(async () => {
    t = await createTestDb();
    // Event A was cancelled and B moved into its round: B's races row (still its old round, not
    // refetched yet) must not pick up A's cancelled schedule via the round fallback.
    await calRow(t, "2026_r05_a-grand-prix", 2026, 5, "cancelled", sessions("2026-05-02T14:00:00", "2026-05-03T13:00:00"));
    await raceRow(t, "2026_r06_b-grand-prix", 2026, 5);
    await calRow(t, "2026_r06_b-grand-prix", 2026, 5, "upcoming", sessions("2026-05-16T14:00:00", "2026-05-17T13:00:00"));
    // Renumbered with a stale races.round: another event's live row holds races.round, but the
    // race's own row (same id) wins.
    await raceRow(t, "2026_r09_c-grand-prix", 2026, 9);
    await calRow(t, "2026_r09_c-grand-prix", 2026, 8, "upcoming", sessions("2026-07-04T14:00:00", "2026-07-05T13:00:00"));
    await calRow(t, "2026_r09_d-grand-prix", 2026, 9, "upcoming", sessions("2026-07-18T14:00:00", "2026-07-19T13:00:00"));
    // Only a cancelled row exists for the race: still used (a cancelled weekend's own deadline).
    await raceRow(t, "2026_r12_e-grand-prix", 2026, 12);
    await calRow(t, "2026_r12_e-grand-prix", 2026, 12, "cancelled", sessions("2026-08-01T14:00:00", "2026-08-02T13:00:00"));
  });
  after(() => t.close());

  test("a cancelled row sharing the round is ignored", async () => {
    assert.deepEqual(await lockOf("2026_r06_b-grand-prix"), { lockAt: "2026-05-16T14:00:00.000Z", raceStart: "2026-05-17T13:00:00.000Z" });
  });

  test("the race's own id beats another event on the same round", async () => {
    assert.deepEqual(await lockOf("2026_r09_c-grand-prix"), { lockAt: "2026-07-04T14:00:00.000Z", raceStart: "2026-07-05T13:00:00.000Z" });
  });

  test("a race whose only calendar row is cancelled keeps that schedule's deadline", async () => {
    assert.deepEqual(await lockOf("2026_r12_e-grand-prix"), { lockAt: "2026-08-01T14:00:00.000Z", raceStart: "2026-08-02T13:00:00.000Z" });
  });

  test("the audit's inline rule agrees on every case", async () => {
    const inline = await t.owner<{ race_id: string; lock_at: string | null; race_start_at: string | null }>(`with ${LOCK_TIMES_CTE} select race_id, lock_at, race_start_at from lock_times`);
    for (const r of inline) {
      const fn = await lockOf(r.race_id);
      assert.equal(r.lock_at ? new Date(r.lock_at).toISOString() : null, fn.lockAt, `${r.race_id}: lock_at`);
      assert.equal(r.race_start_at ? new Date(r.race_start_at).toISOString() : null, fn.raceStart, `${r.race_id}: race_start_at`);
    }
    assert.equal(inline.length, 3);
  });

  test("clients cannot call the schedule lookup", async () => {
    await assert.rejects(t.as("authenticated", null, `select race_calendar_sessions('2026_r06_b-grand-prix')`), /permission denied/);
    await t.as("service_role", null, `select race_calendar_sessions('2026_r06_b-grand-prix')`);
  });
});
