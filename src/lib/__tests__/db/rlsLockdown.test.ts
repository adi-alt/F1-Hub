// Regression tests for supabase/migrations/20260929_rls_lockdown.sql (audit SEC-01, SEC-02,
// SEC-22). Each exploit is first reproduced against the schema as it stood before the migration,
// so these tests prove the migration is what closes it - not that the test setup was too strict.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, seedUser, type TestDb } from "./testDb";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const GROUP = "00000000-0000-4000-8000-000000000001";

async function seed(t: TestDb) {
  await seedUser(t, ALICE);
  await seedUser(t, BOB);
  await seedUser(t, ADMIN, { role: "admin" });
  await t.owner(`insert into groups (id, name, created_by, visibility) values ($1, 'Private club', $2, 'private')`, [GROUP, BOB]);
  await t.owner(`insert into group_members (group_id, user_id, role) values ($1, $2, 'admin')`, [GROUP, BOB]);
  await t.owner(`insert into otp_codes (email, code, expires_at, sent_at) values ('victim@test.local', '123456', now() + interval '10 minutes', now())`);
  await t.owner(`insert into races (id, year, round, name, circuit, status) values ('2026_r01_test', 2026, 1, 'Test GP', 'Sakhir', 'completed')`);
}

async function rejects(p: Promise<unknown>) {
  await assert.rejects(p, /permission denied|violates row-level security/);
}

describe("before the lockdown (reproduces the audit findings)", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb({ upTo: "20260929_rls_lockdown.sql" });
    await seed(t);
  });
  after(() => t.close());

  test("SEC-01: a user could make themselves admin and mint points", async () => {
    await t.as("authenticated", ALICE, `update profiles set role = 'admin', points_balance = 999999 where id = $1`, [ALICE]);
    const [row] = await t.owner<{ role: string; points_balance: number }>(`select role, points_balance from profiles where id = $1`, [ALICE]);
    assert.equal(row.role, "admin");
    assert.equal(row.points_balance, 999999);
  });

  test("SEC-01b: a user could join a private group as its admin", async () => {
    await t.as("authenticated", ALICE, `insert into group_members (group_id, user_id, role) values ($1, $2, 'admin')`, [GROUP, ALICE]);
    const rows = await t.owner(`select 1 from group_members where group_id = $1 and user_id = $2`, [GROUP, ALICE]);
    assert.equal(rows.length, 1);
  });

  test("A-09: the self-referencing group_members policy broke every member read (and so group Realtime)", async () => {
    await assert.rejects(
      t.as("authenticated", BOB, `select user_id from group_members where group_id = $1`, [GROUP]),
      /infinite recursion detected in policy/,
    );
  });

  test("SEC-02: anonymous callers could read every pending OTP code", async () => {
    const rows = await t.as<{ code: string }>("anon", null, `select code from otp_codes`);
    assert.equal(rows[0]?.code, "123456");
  });
});

describe("after the lockdown", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    await seed(t);
  });
  after(() => t.close());

  test("a user cannot change their own role or points balance", async () => {
    await rejects(t.as("authenticated", ALICE, `update profiles set role = 'admin' where id = $1`, [ALICE]));
    await rejects(t.as("authenticated", ALICE, `update profiles set points_balance = 999999 where id = $1`, [ALICE]));
    const [row] = await t.owner<{ role: string | null; points_balance: number }>(`select role, points_balance from profiles where id = $1`, [ALICE]);
    assert.equal(row.role, null);
    assert.equal(row.points_balance, 100);
  });

  test("a user cannot insert or delete profiles", async () => {
    await rejects(t.as("authenticated", ALICE, `delete from profiles where id = $1`, [ALICE]));
    await rejects(t.as("anon", null, `insert into profiles (id) values ($1)`, [ALICE]));
  });

  test("a user cannot join, create, or edit groups directly", async () => {
    await rejects(t.as("authenticated", ALICE, `insert into group_members (group_id, user_id, role) values ($1, $2, 'admin')`, [GROUP, ALICE]));
    await rejects(t.as("authenticated", ALICE, `insert into groups (name, created_by) values ('x', $1)`, [ALICE]));
    await rejects(t.as("authenticated", BOB, `update groups set name = 'renamed' where id = $1`, [GROUP]));
  });

  test("picks, points and prediction entries cannot be written by clients", async () => {
    await rejects(t.as("authenticated", ALICE, `insert into picks (user_id, race_id, predicted_winner, predicted_podium) values ($1, '2026_r01_test', 'VER', '{VER,NOR,LEC}')`, [ALICE]));
    await rejects(t.as("authenticated", ALICE, `insert into points_transactions (user_id, amount, reason) values ($1, 1000, 'x')`, [ALICE]));
  });

  test("OTP codes, the AI cache and the migration ledger are unreadable by clients", async () => {
    await rejects(t.as("anon", null, `select * from otp_codes`));
    await rejects(t.as("authenticated", ALICE, `select * from otp_codes`));
    await rejects(t.as("authenticated", ALICE, `select * from ai_cache`));
    await rejects(t.as("anon", null, `select * from schema_migrations`));
  });

  test("race reference data stays publicly readable but not writable", async () => {
    const rows = await t.as("anon", null, `select id from races`);
    assert.equal(rows.length, 1);
    await t.as("anon", null, `select * from race_results`);
    await t.as("anon", null, `select * from calendar`);
    await rejects(t.as("anon", null, `update races set status = 'upcoming'`));
    await rejects(t.as("authenticated", ALICE, `insert into race_results (race_id, driver) values ('2026_r01_test', 'VER')`));
  });

  test("group membership is readable by members without policy recursion, and hidden from others", async () => {
    const bobs = await t.as("authenticated", BOB, `select user_id from group_members where group_id = $1`, [GROUP]);
    assert.equal(bobs.length, 1);
    const alices = await t.as("authenticated", ALICE, `select user_id from group_members where group_id = $1`, [GROUP]);
    assert.equal(alices.length, 0);
    const privateGroup = await t.as("authenticated", ALICE, `select id from groups where id = $1`, [GROUP]);
    assert.equal(privateGroup.length, 0);
  });

  test("profiles: own row readable, others only by a platform admin", async () => {
    const own = await t.as("authenticated", ALICE, `select id from profiles`);
    assert.deepEqual(own.map((r) => r.id), [ALICE]);
    const all = await t.as("authenticated", ADMIN, `select id from profiles`);
    assert.equal(all.length, 3);
  });

  test("SEC-22: is_admin(uid) can no longer be used to probe other users", async () => {
    await rejects(t.as("anon", null, `select is_admin($1)`, [ADMIN]));
    await rejects(t.as("authenticated", ALICE, `select is_admin($1)`, [ADMIN]));
  });

  test("the migration is idempotent", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sql = fs.readFileSync(path.resolve(__dirname, "../../../../supabase/migrations/20260929_rls_lockdown.sql"), "utf8");
    await t.db.exec(sql);
    await rejects(t.as("authenticated", ALICE, `update profiles set role = 'admin' where id = $1`, [ALICE]));
  });
});
