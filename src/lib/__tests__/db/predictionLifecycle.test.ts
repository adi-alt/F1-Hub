// Regression tests for supabase/migrations/20260930_prediction_lifecycle.sql
// (audit SEC-05, SEC-07, SEC-08, COM-01, COM-02, COM-04, COM-05, DATA-04).
//
// Runs the real schema + migrations in PGlite. NOTE ON CONCURRENCY: PGlite serialises every
// statement on one connection, so these tests prove the transactions are all-or-nothing and that a
// second call after the first has committed moves no points - which is exactly the state a
// concurrent request is reduced to by the row lock (settle_prediction takes FOR UPDATE, entries take
// FOR SHARE on the same row). Genuinely interleaved transactions are tested against a real Postgres
// in concurrency.pg.test.ts (opt-in via TEST_DATABASE_URL).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, seedUser, type TestDb } from "./testDb";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ALICE = uid(1);
const BOB = uid(2);
const CAROL = uid(3);
const OUTSIDER = uid(4);
const GROUP = uid(100);
const OTHER_GROUP = uid(101);

// Session times are the pipeline's naive-UTC strings.
const QUALI = "2026-10-03T14:00:00";
const QUALI_MS = Date.parse(`${QUALI}Z`);
const iso = (ms: number) => new Date(ms).toISOString();

type Session = { label: string; date: string };
const CONVENTIONAL: Session[] = [
  { label: "Practice 1", date: "2026-10-02T11:30:00" },
  { label: "Practice 2", date: "2026-10-02T15:00:00" },
  { label: "Practice 3", date: "2026-10-03T10:30:00" },
  { label: "Qualifying", date: QUALI },
  { label: "Race", date: "2026-10-04T13:00:00" },
];

let raceCounter = 0;
async function seedRace(t: TestDb, sessions: Session[] | null, opts: { status?: string; calendarId?: string } = {}) {
  raceCounter += 1;
  const id = `2026_r${String(raceCounter).padStart(2, "0")}_test-${raceCounter}`; // one event per round: races_year_event_key
  await t.owner(`insert into races (id, year, round, name, circuit, status) values ($1, 2026, $2, 'Test GP', 'Sakhir', $3)`, [id, raceCounter, opts.status ?? "upcoming"]);
  if (sessions !== null) {
    await t.owner(`insert into calendar (id, year, round, sessions) values ($1, 2026, $2, $3::jsonb)`, [opts.calendarId ?? id, raceCounter, JSON.stringify(sessions)]);
  }
  return id;
}

let predictionCounter = 0;
async function seedPrediction(t: TestDb, raceId: string, opts: { type?: string; entryPoints?: number; status?: string; group?: string } = {}) {
  predictionCounter += 1;
  const id = uid(1000 + predictionCounter);
  await t.owner(`insert into group_predictions (id, group_id, race_id, type, entry_points, status, created_by) values ($1, $2, $3, $4, $5, $6, $7)`, [
    id,
    opts.group ?? GROUP,
    raceId,
    opts.type ?? "winner",
    opts.entryPoints ?? 10,
    opts.status ?? "open",
    ALICE,
  ]);
  return id;
}

async function balance(t: TestDb, user: string) {
  return (await t.owner<{ points_balance: number }>(`select points_balance from profiles where id = $1`, [user]))[0].points_balance;
}
async function ledger(t: TestDb, user: string, reason?: string) {
  return t.owner<{ amount: number; reason: string }>(`select amount, reason from points_transactions where user_id = $1 ${reason ? "and reason = $2" : ""} order by created_at, amount`, reason ? [user, reason] : [user]);
}

const enter = (t: TestDb, prediction: string, user: string, guess: unknown, now?: string, group = GROUP) =>
  t.as<{ enter_prediction: { created: boolean; lockAt: string } }>(
    "service_role",
    null,
    `select enter_prediction($1::uuid, $2::uuid, $3::uuid, $4::jsonb${now ? ", $5::timestamptz" : ""}) as enter_prediction`,
    now ? [prediction, group, user, JSON.stringify(guess), now] : [prediction, group, user, JSON.stringify(guess)],
  );
const settle = (t: TestDb, prediction: string, answer: unknown, source: string | null = "official", group = GROUP) =>
  t.as<{ settle_prediction: { alreadyResolved: boolean; paidCount: number; paidTotal: number; correctAnswer: unknown } }>(
    "service_role",
    null,
    `select settle_prediction($1::uuid, $2::uuid, $3::jsonb, $4) as settle_prediction`,
    [prediction, group, JSON.stringify(answer), source],
  );

describe("prediction lifecycle (SQL)", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    for (const [i, id] of [ALICE, BOB, CAROL, OUTSIDER].entries()) await seedUser(t, id, { points: 100 + i * 0 });
    await t.owner(`insert into groups (id, name, created_by, visibility) values ($1, 'Club', $2, 'private'), ($3, 'Other club', $2, 'private')`, [GROUP, ALICE, OTHER_GROUP]);
    for (const user of [ALICE, BOB, CAROL]) await t.owner(`insert into group_members (group_id, user_id, role) values ($1, $2, 'member')`, [GROUP, user]);
    await t.owner(`insert into group_members (group_id, user_id, role) values ($1, $2, 'member')`, [OTHER_GROUP, OUTSIDER]);
  });
  after(() => t.close());

  describe("the deadline is the start of the main Qualifying session", () => {
    const lockOf = async (raceId: string) => (await t.owner<{ v: string | null }>(`select prediction_lock_at($1) as v`, [raceId]))[0].v;

    test("conventional weekend", async () => {
      assert.equal(Date.parse(String(await lockOf(await seedRace(t, CONVENTIONAL)))), QUALI_MS);
    });

    test("2024+ sprint weekend: Sprint Qualifying and Sprint are NOT the cutoff", async () => {
      const race = await seedRace(t, [
        { label: "Practice 1", date: "2026-10-02T11:30:00" },
        { label: "Sprint Qualifying", date: "2026-10-02T15:30:00" },
        { label: "Sprint", date: "2026-10-03T11:00:00" },
        { label: "Qualifying", date: QUALI },
        { label: "Race", date: "2026-10-04T13:00:00" },
      ]);
      assert.equal(Date.parse(String(await lockOf(race))), QUALI_MS);
    });

    test("2023 sprint format (Sprint Shootout) and the 2021-22 format (Sprint after Friday qualifying)", async () => {
      const shootout = await seedRace(t, [
        { label: "Practice 1", date: "2026-10-02T11:30:00" },
        { label: "Qualifying", date: "2026-10-02T15:00:00" },
        { label: "Sprint Shootout", date: "2026-10-03T10:00:00" },
        { label: "Sprint", date: "2026-10-03T14:00:00" },
        { label: "Race", date: "2026-10-04T13:00:00" },
      ]);
      assert.equal(Date.parse(String(await lockOf(shootout))), Date.parse("2026-10-02T15:00:00Z"));
      const classic = await seedRace(t, [
        { label: "Practice 1", date: "2026-10-02T11:30:00" },
        { label: "Qualifying", date: "2026-10-02T15:00:00" },
        { label: "Practice 2", date: "2026-10-03T10:00:00" },
        { label: "Sprint", date: "2026-10-03T14:30:00" },
        { label: "Race", date: "2026-10-04T13:00:00" },
      ]);
      assert.equal(Date.parse(String(await lockOf(classic))), Date.parse("2026-10-02T15:00:00Z"));
    });

    test("a session string that carries its own zone is honoured; naive strings are UTC regardless of database timezone", async () => {
      await t.owner(`set timezone = 'America/Los_Angeles'`);
      try {
        const zoned = await seedRace(t, [{ label: "Qualifying", date: "2026-10-03T16:00:00+02:00" }]);
        assert.equal(Date.parse(String(await lockOf(zoned))), Date.parse("2026-10-03T14:00:00Z"));
        assert.equal(Date.parse(String(await lockOf(await seedRace(t, CONVENTIONAL)))), QUALI_MS);
      } finally {
        await t.owner(`reset timezone`);
      }
    });

    test("calendar row matched by (year, round) when its id differs from the race id", async () => {
      assert.equal(Date.parse(String(await lockOf(await seedRace(t, CONVENTIONAL, { calendarId: "some-other-id" })))), QUALI_MS);
    });

    test("no main Qualifying session, no calendar row, or malformed sessions: the deadline is unknown (null)", async () => {
      assert.equal(await lockOf(await seedRace(t, [{ label: "Race", date: "2026-10-04T13:00:00" }])), null);
      assert.equal(await lockOf(await seedRace(t, null)), null);
      const malformed = await seedRace(t, null);
      await t.owner(`insert into calendar (id, year, round, sessions) values ($1, 2026, 99, '"not an array"'::jsonb)`, [malformed]);
      assert.equal(await lockOf(malformed), null);
    });

    test("prediction_lock_times returns the same answer as prediction_lock_at for many rounds at once", async () => {
      const a = await seedRace(t, CONVENTIONAL);
      const b = await seedRace(t, null);
      const rows = await t.owner<{ race_id: string; lock_at: string | null }>(`select * from prediction_lock_times(array[$1, $2])`, [a, b]);
      assert.equal(Date.parse(String(rows.find((r) => r.race_id === a)!.lock_at)), QUALI_MS);
      assert.equal(rows.find((r) => r.race_id === b)!.lock_at, null);
    });
  });

  describe("entering and editing", () => {
    test("before the deadline: accepted, fee charged once, ledger written", async () => {
      const prediction = await seedPrediction(t, await seedRace(t, CONVENTIONAL), { entryPoints: 10 });
      const before = await balance(t, BOB);
      const [{ enter_prediction: res }] = await enter(t, prediction, BOB, "VER", iso(QUALI_MS - 60_000));
      assert.equal(res.created, true);
      assert.equal(await balance(t, BOB), before - 10);
      assert.deepEqual((await ledger(t, BOB, "prediction_entry")).slice(-1)[0].amount, -10);
      const [entry] = await t.owner<{ points_wagered: number }>(`select points_wagered from group_prediction_entries where prediction_id = $1 and user_id = $2`, [prediction, BOB]);
      assert.equal(entry.points_wagered, 10);
    });

    test("boundary: one millisecond before the cutoff is accepted; exactly at the cutoff and after are rejected, with nothing charged or stored", async () => {
      const prediction = await seedPrediction(t, await seedRace(t, CONVENTIONAL), { entryPoints: 10 });
      await enter(t, prediction, ALICE, "VER", iso(QUALI_MS - 1));

      const carolBefore = await balance(t, CAROL);
      await assert.rejects(enter(t, prediction, CAROL, "NOR", iso(QUALI_MS)), /prediction_locked/);
      await assert.rejects(enter(t, prediction, CAROL, "NOR", iso(QUALI_MS + 1)), /prediction_locked/);
      await assert.rejects(enter(t, prediction, CAROL, "NOR", iso(QUALI_MS + 3 * 3600_000)), /prediction_locked/);
      assert.equal(await balance(t, CAROL), carolBefore);
      assert.equal((await t.owner(`select 1 from group_prediction_entries where prediction_id = $1 and user_id = $2`, [prediction, CAROL])).length, 0);
    });

    test("the actual exploit: a pick edited after the deadline (results known) is refused and the old pick stands", async () => {
      const prediction = await seedPrediction(t, await seedRace(t, CONVENTIONAL));
      await enter(t, prediction, BOB, "HAM", iso(QUALI_MS - 60_000));
      await assert.rejects(enter(t, prediction, BOB, "VER", iso(QUALI_MS + 24 * 3600_000)), /prediction_locked/);
      const [entry] = await t.owner<{ guess: string }>(`select guess from group_prediction_entries where prediction_id = $1 and user_id = $2`, [prediction, BOB]);
      assert.equal(entry.guess, "HAM");
    });

    test("editing before the deadline changes the guess without re-charging, and stamps updated_at", async () => {
      const prediction = await seedPrediction(t, await seedRace(t, CONVENTIONAL), { entryPoints: 10 });
      await enter(t, prediction, BOB, "HAM", iso(QUALI_MS - 120_000));
      const afterFirst = await balance(t, BOB);
      const [{ enter_prediction: res }] = await enter(t, prediction, BOB, "VER", iso(QUALI_MS - 60_000));
      assert.equal(res.created, false);
      assert.equal(await balance(t, BOB), afterFirst);
      const [entry] = await t.owner<{ guess: string; updated_at: string | null }>(`select guess, updated_at from group_prediction_entries where prediction_id = $1 and user_id = $2`, [prediction, BOB]);
      assert.equal(entry.guess, "VER");
      assert.equal(new Date(String(entry.updated_at)).getTime(), QUALI_MS - 60_000);
    });

    test("a stored status of locked or resolved blocks entry even if the clock says it is early", async () => {
      const race = await seedRace(t, CONVENTIONAL);
      await assert.rejects(enter(t, await seedPrediction(t, race, { status: "locked" }), BOB, "VER", iso(QUALI_MS - 3600_000)), /prediction_locked/);
      await assert.rejects(enter(t, await seedPrediction(t, race, { status: "resolved", type: "pole" }), BOB, "VER", iso(QUALI_MS - 3600_000)), /prediction_resolved/);
    });

    test("fails closed when the deadline is unknown", async () => {
      const prediction = await seedPrediction(t, await seedRace(t, [{ label: "Race", date: "2026-10-04T13:00:00" }]));
      await assert.rejects(enter(t, prediction, BOB, "VER", "2026-01-01T00:00:00Z"), /lock_unknown/);
    });

    test("authorization: a non-member and a wrong-group request are rejected", async () => {
      const prediction = await seedPrediction(t, await seedRace(t, CONVENTIONAL));
      await assert.rejects(enter(t, prediction, OUTSIDER, "VER", iso(QUALI_MS - 1000)), /not_a_member/);
      await assert.rejects(enter(t, prediction, OUTSIDER, "VER", iso(QUALI_MS - 1000), OTHER_GROUP), /prediction_not_found/);
    });

    test("insufficient points rolls the whole entry back", async () => {
      const prediction = await seedPrediction(t, await seedRace(t, CONVENTIONAL), { entryPoints: 500 });
      const before = await balance(t, BOB);
      await assert.rejects(enter(t, prediction, BOB, "VER", iso(QUALI_MS - 1000)), /insufficient_points/);
      assert.equal(await balance(t, BOB), before);
      assert.equal((await t.owner(`select 1 from group_prediction_entries where prediction_id = $1 and user_id = $2`, [prediction, BOB])).length, 0);
    });

    test("invalid guesses are rejected for every type", async () => {
      const at = iso(QUALI_MS - 1000);
      const race = await seedRace(t, CONVENTIONAL);
      const podium = await seedPrediction(t, race, { type: "podium" });
      for (const bad of [["VER", "VER", "NOR"], ["VER", "NOR"], "VER", ["VER", "NOR", ""], ["VER", "NOR", 3], null]) {
        await assert.rejects(enter(t, podium, BOB, bad, at), /invalid_guess/, JSON.stringify(bad));
      }
      const dnf = await seedPrediction(t, race, { type: "dnf_count" });
      for (const bad of [-1, 1.5, "3", ["3"]]) await assert.rejects(enter(t, dnf, BOB, bad, at), /invalid_guess/, JSON.stringify(bad));
      await assert.rejects(enter(t, await seedPrediction(t, race, { type: "winner" }), BOB, "", at), /invalid_guess/);
      await enter(t, dnf, BOB, 3, at);
      await enter(t, podium, BOB, ["VER", "NOR", "LEC"], at);
    });

    test("clients cannot call the lifecycle functions", async () => {
      const prediction = await seedPrediction(t, await seedRace(t, CONVENTIONAL));
      for (const role of ["anon", "authenticated"] as const) {
        await assert.rejects(t.as(role, BOB, `select enter_prediction($1::uuid, $2::uuid, $3::uuid, '"VER"'::jsonb)`, [prediction, GROUP, BOB]), /permission denied/);
        await assert.rejects(t.as(role, BOB, `select settle_prediction($1::uuid, $2::uuid, '"VER"'::jsonb)`, [prediction, GROUP]), /permission denied/);
        await assert.rejects(t.as(role, BOB, `select lock_due_predictions()`), /permission denied/);
        await assert.rejects(t.as(role, BOB, `select save_pick($1::uuid, 'x', 'VER', array['VER','NOR','LEC'])`, [BOB]), /permission denied/);
      }
    });
  });

  describe("settling (atomic and idempotent)", () => {
    async function roundWithEntries(type: string, entries: [string, unknown][], entryPoints = 10) {
      const prediction = await seedPrediction(t, await seedRace(t, CONVENTIONAL), { type, entryPoints });
      for (const [user, guess] of entries) await enter(t, prediction, user, guess, iso(QUALI_MS - 1000));
      return prediction;
    }

    test("winner: correct guess pays double the wager, wrong pays nothing, ledger and entries agree", async () => {
      const prediction = await roundWithEntries("winner", [[BOB, "VER"], [CAROL, "NOR"]]);
      const [b0, c0] = [await balance(t, BOB), await balance(t, CAROL)];
      const [{ settle_prediction: res }] = await settle(t, prediction, "VER", "official");
      assert.equal(res.alreadyResolved, false);
      assert.equal(res.paidCount, 1);
      assert.equal(res.paidTotal, 20);
      assert.equal(await balance(t, BOB), b0 + 20);
      assert.equal(await balance(t, CAROL), c0);
      const awarded = await t.owner<{ user_id: string; points_awarded: number }>(`select user_id, points_awarded from group_prediction_entries where prediction_id = $1`, [prediction]);
      assert.equal(awarded.find((r) => r.user_id === BOB)!.points_awarded, 20);
      assert.equal(awarded.find((r) => r.user_id === CAROL)!.points_awarded, 0);
      const [p] = await t.owner<{ status: string; correct_answer: string; resolved_results_source: string; resolved_at: string | null }>(
        `select status, correct_answer, resolved_results_source, resolved_at from group_predictions where id = $1`,
        [prediction],
      );
      assert.equal(p.status, "resolved");
      assert.equal(p.correct_answer, "VER");
      assert.equal(p.resolved_results_source, "official");
      assert.ok(p.resolved_at);
      assert.equal((await t.owner(`select 1 from points_transactions where prediction_id = $1 and reason = 'prediction_payout'`, [prediction])).length, 1);
    });

    test("DUPLICATE RESOLUTION: resolving again (double click, retry, second admin) pays nothing more and keeps the original answer", async () => {
      const prediction = await roundWithEntries("winner", [[BOB, "VER"]]);
      await settle(t, prediction, "VER");
      const [afterFirst, ledgerFirst] = [await balance(t, BOB), (await ledger(t, BOB)).length];

      for (let i = 0; i < 3; i++) {
        const [{ settle_prediction: again }] = await settle(t, prediction, "VER");
        assert.equal(again.alreadyResolved, true);
        assert.equal(again.paidTotal, 0);
      }
      const [{ settle_prediction: different }] = await settle(t, prediction, "NOR"); // a later, different answer must not re-score
      assert.equal(different.alreadyResolved, true);
      assert.equal(different.correctAnswer, "VER");

      assert.equal(await balance(t, BOB), afterFirst);
      assert.equal((await ledger(t, BOB)).length, ledgerFirst);
    });

    test("podium: partial credit uses the 3/1/0 slot score out of 9, doubled", async () => {
      // wager 9: actual [VER,LEC,NOR]; BOB [VER,NOR,LEC] = 3+1+1 = 5 -> 9*5*2/9 = 10; CAROL exact = 18; ALICE none = 0
      const prediction = await roundWithEntries(
        "podium",
        [[BOB, ["VER", "NOR", "LEC"]], [CAROL, ["VER", "LEC", "NOR"]], [ALICE, ["HAM", "RUS", "PIA"]]],
        9,
      );
      await settle(t, prediction, ["VER", "LEC", "NOR"]);
      const rows = await t.owner<{ user_id: string; points_awarded: number }>(`select user_id, points_awarded from group_prediction_entries where prediction_id = $1`, [prediction]);
      const got = Object.fromEntries(rows.map((r) => [r.user_id, r.points_awarded]));
      assert.deepEqual(got, { [BOB]: 10, [CAROL]: 18, [ALICE]: 0 });
    });

    test("the SQL payout formula matches the previous TypeScript formula for every wager/score", async () => {
      const rows = await t.owner<{ w: number; s: number; sql_payout: number }>(
        `select w, s, round(w * s * 2 / 9.0)::int as sql_payout from generate_series(0, 300) w, generate_series(0, 9) s`,
      );
      for (const r of rows) assert.equal(r.sql_payout, Math.round(r.w * (r.s / 9) * 2), `wager ${r.w} score ${r.s}`);
    });

    test("dnf_count compares numerically", async () => {
      const prediction = await roundWithEntries("dnf_count", [[BOB, 2], [CAROL, 3]]);
      await t.as("service_role", null, `select settle_prediction($1::uuid, $2::uuid, '2.0'::jsonb, 'official')`, [prediction, GROUP]);
      const rows = await t.owner<{ user_id: string; points_awarded: number }>(`select user_id, points_awarded from group_prediction_entries where prediction_id = $1`, [prediction]);
      assert.equal(rows.find((r) => r.user_id === BOB)!.points_awarded, 20);
      assert.equal(rows.find((r) => r.user_id === CAROL)!.points_awarded, 0);
    });

    test("free rounds settle without touching balances or writing payout rows", async () => {
      const prediction = await roundWithEntries("winner", [[BOB, "VER"]], 0);
      const before = await balance(t, BOB);
      await settle(t, prediction, "VER");
      assert.equal(await balance(t, BOB), before);
      assert.equal((await t.owner(`select 1 from points_transactions where prediction_id = $1`, [prediction])).length, 0);
    });

    test("a round the old code left half-settled never pays an already-awarded entry a second time", async () => {
      const prediction = await roundWithEntries("winner", [[BOB, "VER"], [CAROL, "VER"]]);
      // Legacy state: BOB's entry was marked awarded (and possibly paid) before the old loop died.
      await t.owner(`update group_prediction_entries set points_awarded = 20 where prediction_id = $1 and user_id = $2`, [prediction, BOB]);
      const [b0, c0] = [await balance(t, BOB), await balance(t, CAROL)];
      await settle(t, prediction, "VER");
      assert.equal(await balance(t, BOB), b0, "already-awarded entry is not paid again");
      assert.equal(await balance(t, CAROL), c0 + 20);
    });

    test("an invalid answer, a wrong group, or an unknown round changes nothing", async () => {
      const prediction = await roundWithEntries("podium", [[BOB, ["VER", "NOR", "LEC"]]]);
      const before = await balance(t, BOB);
      await assert.rejects(settle(t, prediction, ["VER", "VER", "NOR"]), /invalid_answer/);
      await assert.rejects(settle(t, prediction, ["VER", "NOR", "LEC"], "official", OTHER_GROUP), /prediction_not_found/);
      await assert.rejects(settle(t, uid(9999), "VER"), /prediction_not_found/);
      assert.equal(await balance(t, BOB), before);
      assert.equal((await t.owner<{ status: string }>(`select status from group_predictions where id = $1`, [prediction]))[0].status, "open");
    });

    test("nobody can enter once a round is resolved, so a late entry can never receive a payout", async () => {
      const prediction = await roundWithEntries("winner", [[BOB, "VER"]]);
      await settle(t, prediction, "VER");
      await assert.rejects(enter(t, prediction, CAROL, "VER", iso(QUALI_MS - 3600_000)), /prediction_resolved/);
    });

    test("the ledger itself refuses a second payout or entry charge for the same round and user", async () => {
      const prediction = await roundWithEntries("winner", [[BOB, "VER"]]);
      await settle(t, prediction, "VER");
      await assert.rejects(
        t.owner(`insert into points_transactions (user_id, amount, reason, group_id, prediction_id) values ($1, 20, 'prediction_payout', $2, $3)`, [BOB, GROUP, prediction]),
        /points_transactions_one_per_round_user/,
      );
      await assert.rejects(
        t.owner(`insert into points_transactions (user_id, amount, reason, group_id, prediction_id) values ($1, -10, 'prediction_entry', $2, $3)`, [BOB, GROUP, prediction]),
        /points_transactions_one_per_round_user/,
      );
    });

    test("ledger and balance reconcile exactly after a full round (no drift)", async () => {
      const users = [ALICE, BOB, CAROL];
      const start = Object.fromEntries(await Promise.all(users.map(async (u) => [u, await balance(t, u)])));
      const prediction = await roundWithEntries("winner", [[ALICE, "VER"], [BOB, "VER"], [CAROL, "NOR"]], 10);
      await settle(t, prediction, "VER");
      for (const u of users) {
        const net = (await t.owner<{ s: string }>(`select coalesce(sum(amount), 0) as s from points_transactions where user_id = $1 and prediction_id = $2`, [u, prediction]))[0].s;
        assert.equal(await balance(t, u), start[u] + Number(net));
      }
    });
  });

  describe("scheduled lock", () => {
    test("moves only open rounds past their deadline to locked, is idempotent, and never touches points or answers", async () => {
      const past = await seedPrediction(t, await seedRace(t, [{ label: "Qualifying", date: "2000-01-01T10:00:00" }]));
      const future = await seedPrediction(t, await seedRace(t, [{ label: "Qualifying", date: "2999-01-01T10:00:00" }]));
      const unknown = await seedPrediction(t, await seedRace(t, null));
      const resolved = await seedPrediction(t, await seedRace(t, [{ label: "Qualifying", date: "2000-01-01T10:00:00" }]), { status: "resolved", type: "pole" });
      const balanceBefore = await balance(t, BOB);

      await t.as("service_role", null, `select lock_due_predictions()`);
      const status = async (id: string) => (await t.owner<{ status: string }>(`select status from group_predictions where id = $1`, [id]))[0].status;
      assert.equal(await status(past), "locked");
      assert.equal(await status(future), "open");
      assert.equal(await status(unknown), "open");
      assert.equal(await status(resolved), "resolved");

      const [{ lock_due_predictions: again }] = await t.as<{ lock_due_predictions: number }>("service_role", null, `select lock_due_predictions()`);
      assert.equal(again, 0);
      assert.equal(await balance(t, BOB), balanceBefore);
    });

    test("the cron job is registered when pg_cron is available", async () => {
      const jobs = await t.owner<{ jobname: string }>(`select jobname from cron.job where jobname = 'lock-due-predictions'`);
      assert.equal(jobs.length, 1);
    });
  });

  describe("personal picks", () => {
    const savePick = (race: string, user: string, now: string, podium = ["VER", "NOR", "LEC"]) =>
      t.as<{ save_pick: string }>("service_role", null, `select save_pick($1::uuid, $2, $3, $4::text[], p_now => $5::timestamptz) as save_pick`, [user, race, podium[0], `{${podium.join(",")}}`, now]);
    const RACE_START_MS = Date.parse("2026-10-04T13:00:00Z");

    test("accepted before race start with the SERVER's timestamp; rejected at and after it", async () => {
      const race = await seedRace(t, CONVENTIONAL);
      await savePick(race, BOB, iso(RACE_START_MS - 1));
      const [pick] = await t.owner<{ submitted_at: string }>(`select submitted_at from picks where user_id = $1 and race_id = $2`, [BOB, race]);
      assert.equal(new Date(pick.submitted_at).getTime(), RACE_START_MS - 1);
      await assert.rejects(savePick(race, CAROL, iso(RACE_START_MS)), /picks_closed/);
      await assert.rejects(savePick(race, CAROL, iso(RACE_START_MS + 60_000)), /picks_closed/);
      assert.equal((await t.owner(`select 1 from picks where user_id = $1 and race_id = $2`, [CAROL, race])).length, 0);
    });

    test("editing after race start is refused and the earlier pick stands (the old in-race edit hole)", async () => {
      const race = await seedRace(t, CONVENTIONAL);
      await savePick(race, BOB, iso(RACE_START_MS - 3600_000), ["VER", "NOR", "LEC"]);
      await assert.rejects(savePick(race, BOB, iso(RACE_START_MS + 3600_000), ["HAM", "RUS", "PIA"]), /picks_closed/);
      const [pick] = await t.owner<{ predicted_winner: string }>(`select predicted_winner from picks where user_id = $1 and race_id = $2`, [BOB, race]);
      assert.equal(pick.predicted_winner, "VER");
    });

    test("a race that is no longer upcoming is closed regardless of the clock; an unknown start falls back to status only", async () => {
      await assert.rejects(savePick(await seedRace(t, CONVENTIONAL, { status: "completed" }), BOB, iso(RACE_START_MS - 3600_000)), /picks_closed/);
      const noSchedule = await seedRace(t, null);
      await savePick(noSchedule, BOB, "2026-10-04T15:00:00Z");
      await assert.rejects(savePick("nonexistent", BOB, iso(RACE_START_MS - 1)), /race_not_found/);
    });

    test("malformed picks are rejected", async () => {
      const race = await seedRace(t, CONVENTIONAL);
      await assert.rejects(savePick(race, BOB, iso(RACE_START_MS - 1), ["VER", "NOR"]), /invalid_pick/);
    });
  });
});
