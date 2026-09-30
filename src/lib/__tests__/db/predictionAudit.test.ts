// Tests for the read-only historical audit (scripts/lib/predictionAudit.mjs).
//
// The audit runs against the schema as it stands BEFORE the lifecycle migration (that's when the
// baseline is wanted), so the legacy anomalies below are seeded on a database built only up to that
// point - reproducing what the old code could leave behind - and each query must find exactly its own.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AUDIT_QUERIES, LOCK_TIMES_CTE, MONEY_RELEVANT, formatReport, runPredictionAudit } from "../../../../scripts/lib/predictionAudit.mjs";
import { createTestDb, seedUser, type TestDb } from "./testDb";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, C, D] = [uid(1), uid(2), uid(3), uid(4)];
const GROUP = uid(100);

const QUALI = "2025-10-03T14:00:00"; // deadline for R1
const RACE = "2025-10-04T13:00:00";
const CONVENTIONAL = [
  { label: "Practice 1", date: "2025-10-02T11:30:00" },
  { label: "Qualifying", date: QUALI },
  { label: "Race", date: RACE },
];

async function race(t: TestDb, id: string, round: number, status: string, sessions: unknown[] | null, resultsSource = "official") {
  await t.owner(`insert into races (id, year, round, name, circuit, status, results_source) values ($1, 2026, $2, $1, 'Sakhir', $3, $4)`, [id, round, status, resultsSource]);
  if (sessions) await t.owner(`insert into calendar (id, year, round, sessions) values ($1, 2026, $2, $3::jsonb)`, [id, round, JSON.stringify(sessions)]);
}
let n = 0;
async function round(t: TestDb, raceId: string, opts: { type?: string; status?: string; createdAt?: string } = {}) {
  n += 1;
  const id = uid(1000 + n);
  await t.owner(`insert into group_predictions (id, group_id, race_id, type, entry_points, status, created_by, created_at) values ($1, $2, $3, $4, 10, $5, $6, $7::timestamptz)`, [
    id, GROUP, raceId, opts.type ?? "winner", opts.status ?? "open", A, opts.createdAt ?? "2025-09-01T00:00:00Z",
  ]);
  return id;
}
const entry = (t: TestDb, prediction: string, user: string, at: string, awarded: number | null, wagered = 10) =>
  t.owner(`insert into group_prediction_entries (prediction_id, user_id, guess, points_wagered, points_awarded, created_at) values ($1, $2, '"VER"', $3, $4, $5::timestamptz)`, [prediction, user, wagered, awarded, at]);
const ledger = (t: TestDb, user: string, amount: number, reason: string, prediction: string | null) =>
  t.owner(`insert into points_transactions (user_id, amount, reason, group_id, prediction_id) values ($1, $2, $3, $4, $5)`, [user, amount, reason, GROUP, prediction]);

async function seedGroup(t: TestDb) {
  for (const u of [A, B, C, D]) await seedUser(t, u);
  await t.owner(`insert into groups (id, name, created_by, visibility) values ($1, 'Club', $2, 'private')`, [GROUP, A]);
  for (const u of [A, B, C]) await t.owner(`insert into group_members (group_id, user_id, role) values ($1, $2, 'member')`, [GROUP, u]);
}

describe("prediction history audit", () => {
  let t: TestDb;
  const ids: Record<string, string> = {};
  let results: Awaited<ReturnType<typeof runPredictionAudit>>;

  before(async () => {
    // Deliberately the pre-lifecycle schema: no lock functions, no updated_at, no resolved_results_source.
    t = await createTestDb({ upTo: "20260930_prediction_lifecycle.sql" });
    await seedGroup(t);

    await race(t, "R1", 1, "completed", CONVENTIONAL);
    await race(t, "R2", 2, "completed", CONVENTIONAL, "openf1_preliminary");
    await race(t, "R3", 3, "upcoming", [{ label: "Qualifying", date: "2999-01-01T10:00:00" }, { label: "Race", date: "2999-01-02T13:00:00" }]);
    await race(t, "R4", 4, "upcoming", null); // no calendar row
    await race(t, "R5", 5, "upcoming", [{ label: "Race", date: "2999-01-02T13:00:00" }]); // no qualifying session

    // Clean, resolved, paid correctly: A entered before the deadline.
    ids.clean = await round(t, "R1", { status: "resolved", type: "winner" });
    await entry(t, ids.clean, A, "2025-10-03T13:00:00Z", 20);
    await ledger(t, A, -10, "prediction_entry", ids.clean);
    await ledger(t, A, 20, "prediction_payout", ids.clean);

    // The exploit: B entered AFTER qualifying began and was paid.
    ids.late = await round(t, "R1", { status: "resolved", type: "podium" });
    await entry(t, ids.late, B, "2025-10-04T10:00:00Z", 20);
    await ledger(t, B, -10, "prediction_entry", ids.late);
    await ledger(t, B, 20, "prediction_payout", ids.late);

    // Double payout: A credited twice for one entry.
    ids.dup = await round(t, "R1", { status: "resolved", type: "fastest_lap" });
    await entry(t, ids.dup, A, "2025-10-03T12:00:00Z", 20);
    await ledger(t, A, -10, "prediction_entry", ids.dup);
    await ledger(t, A, 20, "prediction_payout", ids.dup);
    await ledger(t, A, 20, "prediction_payout", ids.dup);

    // Preliminary results + an entry that was never scored.
    ids.prelim = await round(t, "R2", { status: "resolved", type: "winner" });
    await entry(t, ids.prelim, C, "2025-10-03T12:00:00Z", null);
    await ledger(t, C, -10, "prediction_entry", ids.prelim);

    // Half-settled: still open, race finished, an entry already awarded (old loop died part-way).
    ids.half = await round(t, "R1", { status: "open", type: "pole" });
    await entry(t, ids.half, A, "2025-10-03T12:00:00Z", 10);
    await ledger(t, A, -10, "prediction_entry", ids.half);

    // A round opened after the deadline.
    ids.lateRound = await round(t, "R1", { status: "open", type: "dnf_count", createdAt: "2025-10-03T15:00:00Z" });

    // Healthy future round: nothing should flag it. B has an entry with NO ledger charge (fee unrecorded).
    ids.future = await round(t, "R3", { status: "open" });
    await entry(t, ids.future, B, "2025-09-20T00:00:00Z", null);

    // Unknown deadlines.
    ids.noCal = await round(t, "R4", { status: "open" });
    ids.noQuali = await round(t, "R5", { status: "open" });

    // A payout row with no entry behind it.
    await ledger(t, C, 30, "prediction_payout", ids.future);

    // Balances: A's is inflated well beyond its ledger; D has no ledger and the default 100.
    await t.owner(`update profiles set points_balance = 500 where id = $1`, [A]);

    // Picks: A stamped after the race started, B before.
    await t.owner(`insert into picks (user_id, race_id, predicted_winner, predicted_podium, submitted_at) values ($1, 'R1', 'VER', '{VER,NOR,LEC}', '2025-10-04T14:00:00Z')`, [A]);
    await t.owner(`insert into picks (user_id, race_id, predicted_winner, predicted_podium, submitted_at) values ($1, 'R1', 'VER', '{VER,NOR,LEC}', '2025-10-04T12:00:00Z')`, [B]);

    results = await runPredictionAudit((sql: string) => t.db.query(sql) as Promise<{ rows: Record<string, unknown>[] }>);
  });
  after(() => t.close());

  const finding = (id: string) => results.find((r) => r.id === id)!;
  const keys = (id: string, col: string) => finding(id).rows.map((r: Record<string, unknown>) => r[col]).sort();

  test("inventory counts everything", () => {
    const [s] = finding("summary").rows as Record<string, number>[];
    assert.equal(s.rounds_total, n);
    assert.equal(s.rounds_resolved, 4);
    assert.equal(s.picks_total, 2);
  });

  test("rounds whose deadline cannot be determined: no calendar row, or no main Qualifying session", () => {
    assert.deepEqual(keys("unknown_deadline", "prediction_id"), [ids.noCal, ids.noQuali].sort());
  });

  test("open rounds past their deadline, and unresolved rounds after the race", () => {
    assert.deepEqual(keys("open_past_deadline", "prediction_id"), [ids.half, ids.lateRound].sort());
    assert.deepEqual(keys("unresolved_after_race", "prediction_id"), [ids.half, ids.lateRound].sort());
  });

  test("a round created after its own deadline", () => {
    assert.deepEqual(keys("rounds_created_after_deadline", "prediction_id"), [ids.lateRound]);
    assert.equal((finding("rounds_created_after_deadline").rows[0] as { minutes_after_deadline: number }).minutes_after_deadline, 60);
  });

  test("THE EXPLOIT WINDOW: an entry created after the deadline is found, with how late it was, and paid entries sort first", () => {
    const rows = finding("post_cutoff_entries").rows as { prediction_id: string; user_id: string; minutes_after_deadline: number; points_awarded: number }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].prediction_id, ids.late);
    assert.equal(rows[0].user_id, B);
    assert.equal(rows[0].minutes_after_deadline, 20 * 60); // 14:00 Saturday -> 10:00 Sunday
    assert.equal(rows[0].points_awarded, 20);
  });

  test("a double payout is found with the amount over-paid", () => {
    const rows = finding("duplicate_ledger_rows").rows as { prediction_id: string; user_id: string; reason: string; rows: number; extra: number }[];
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].prediction_id, rows[0].user_id, rows[0].reason, rows[0].rows, rows[0].extra], [ids.dup, A, "prediction_payout", 2, 20]);
  });

  test("an award the ledger does not match is found in both directions", () => {
    const rows = finding("payout_ledger_mismatch").rows as { prediction_id: string; user_id: string; awarded_minus_paid: number }[];
    const byRound = Object.fromEntries(rows.map((r) => [r.prediction_id, r.awarded_minus_paid]));
    assert.equal(byRound[ids.dup], -20, "ledger paid 40 against an award of 20");
    assert.equal(byRound[ids.half], 10, "awarded 10 with nothing paid (half-settled)");
    assert.equal(byRound[ids.clean], undefined, "a correctly paid entry is not flagged");
    assert.equal(byRound[ids.late], undefined);
  });

  test("a payout with no entry, and a fee with no ledger row", () => {
    assert.deepEqual(keys("orphan_payouts", "prediction_id"), [ids.future]);
    assert.deepEqual(keys("entry_charge_mismatch", "prediction_id"), [ids.future]);
  });

  test("half-settled and unscored rounds", () => {
    assert.deepEqual(keys("partial_settlement", "prediction_id"), [ids.half]);
    assert.deepEqual(keys("resolved_unscored_entries", "prediction_id"), [ids.prelim]);
  });

  test("resolved against preliminary results", () => {
    assert.deepEqual(keys("resolved_on_preliminary", "prediction_id"), [ids.prelim]);
  });

  test("a balance that is not 100 + the ledger's net", () => {
    const rows = finding("balance_vs_ledger").rows as { user_id: string; difference: number }[];
    const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r.difference]));
    assert.ok(byUser[A] > 0, "A's balance exceeds what the ledger explains");
    assert.equal(byUser[D], undefined, "an untouched account is not flagged");
  });

  test("a personal pick stamped after the race started", () => {
    const rows = finding("picks_after_race_start").rows as { user_id: string; minutes_after_start: number }[];
    assert.deepEqual(rows.map((r) => r.user_id), [A]);
    assert.equal(rows[0].minutes_after_start, 60);
  });

  test("a healthy database reports nothing", async () => {
    const clean = await createTestDb({ upTo: "20260930_prediction_lifecycle.sql" });
    try {
      await seedGroup(clean);
      await race(clean, "R1", 1, "completed", CONVENTIONAL);
      const p = await round(clean, "R1", { status: "resolved" });
      await entry(clean, p, A, "2025-10-03T13:00:00Z", 20);
      await ledger(clean, A, -10, "prediction_entry", p);
      await ledger(clean, A, 20, "prediction_payout", p);
      await clean.owner(`update profiles set points_balance = 110 where id = $1`, [A]);
      const res = await runPredictionAudit((sql: string) => clean.db.query(sql) as Promise<{ rows: Record<string, unknown>[] }>);
      assert.deepEqual(res.filter((r) => r.id !== "summary" && r.total > 0).map((r) => r.id), []);
    } finally {
      await clean.close();
    }
  });

  test("the audit is read-only: it runs inside a READ ONLY transaction, and no query contains a write", async () => {
    await t.db.transaction(async (tx) => {
      await tx.exec("set transaction read only");
      for (const q of AUDIT_QUERIES) await tx.query(q.sql);
      await assert.rejects(tx.exec("update profiles set points_balance = 0"), /read-only transaction/);
    });
    for (const q of AUDIT_QUERIES) assert.doesNotMatch(q.sql, /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i, q.id);
  });

  test("the report names each finding, flags the ones that concern points, and says nothing was changed", () => {
    const report = formatReport(results);
    assert.match(report, /read-only: nothing was changed/);
    assert.match(report, /\[points\]\s+Entries created at or after the deadline/);
    assert.match(report, /Nothing above has been corrected/);
    assert.ok(MONEY_RELEVANT.has("duplicate_ledger_rows"));
    assert.ok(!MONEY_RELEVANT.has("unknown_deadline"));
  });
});

describe("the audit's inline deadline rule matches the lifecycle migration's functions", () => {
  test("for every weekend format and for missing data", async () => {
    const t = await createTestDb(); // full schema, including prediction_lock_at / race_start_at
    try {
      const formats: Record<string, unknown[] | null> = {
        conventional: CONVENTIONAL,
        sprint2024: [
          { label: "Practice 1", date: "2025-10-02T11:30:00" },
          { label: "Sprint Qualifying", date: "2025-10-02T15:30:00" },
          { label: "Sprint", date: "2025-10-03T11:00:00" },
          { label: "Qualifying", date: "2025-10-03T15:00:00" },
          { label: "Race", date: RACE },
        ],
        shootout2023: [
          { label: "Qualifying", date: "2025-10-02T15:00:00" },
          { label: "Sprint Shootout", date: "2025-10-03T10:00:00" },
          { label: "Sprint", date: "2025-10-03T14:00:00" },
          { label: "Race", date: RACE },
        ],
        zoned: [{ label: "Qualifying", date: "2025-10-03T16:00:00+02:00" }, { label: "Race", date: "2025-10-04T15:00:00Z" }],
        noQualifying: [{ label: "Race", date: RACE }],
        badDate: [{ label: "Qualifying", date: "" }, { label: "Race", date: RACE }],
        noCalendar: null,
      };
      let round = 0;
      for (const [name, sessions] of Object.entries(formats)) {
        round += 1;
        await race(t, name, round, "upcoming", sessions);
      }
      const inline = await t.owner<{ race_id: string; lock_at: string | null; race_start_at: string | null }>(`with ${LOCK_TIMES_CTE} select race_id, lock_at, race_start_at from lock_times`);
      const inlineBy = new Map(inline.map((r) => [r.race_id, r]));
      for (const name of Object.keys(formats)) {
        const [fn] = await t.owner<{ lock_at: string | null; race_start_at: string | null }>(`select prediction_lock_at($1) as lock_at, race_start_at($1) as race_start_at`, [name]);
        const got = inlineBy.get(name);
        const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
        assert.equal(ms(got?.lock_at ?? null), ms(fn.lock_at), `${name}: lock_at`);
        assert.equal(ms(got?.race_start_at ?? null), ms(fn.race_start_at), `${name}: race_start_at`);
      }
    } finally {
      await t.close();
    }
  });
});
