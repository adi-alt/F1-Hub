// Regression tests for supabase/migrations/20261021_post_calls.sql (takes with receipts).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, seedUser, type TestDb } from "./testDb";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AUTHOR = uid(1);
const POST = uid(200);
const RACE = "2026_r18_united-states-grand-prix";

describe("post_calls", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    await seedUser(t, AUTHOR);
    await t.owner(`insert into group_posts (id, group_id, user_id, content) values ($1, null, $2, 'Norris takes it')`, [POST, AUTHOR]);
  });
  after(() => t.close());

  const insert = (role: "anon" | "authenticated" | "service_role", values: { driver?: string | null; kind?: string; threshold?: number | null } = {}) =>
    t.as(role, role === "anon" ? null : AUTHOR, `insert into post_calls (post_id, user_id, race_id, kind, driver, threshold, locks_at) values ($1, $2, $3, $4, $5, $6, now() + interval '1 day')`, [
      POST,
      AUTHOR,
      RACE,
      values.kind ?? "winner",
      values.driver === undefined ? "NOR" : values.driver,
      values.threshold ?? null,
    ]);

  test("clients can neither read nor write calls; the server can", async () => {
    await assert.rejects(insert("authenticated"), /permission denied/);
    await assert.rejects(insert("anon"), /permission denied/);
    await assert.rejects(t.as("authenticated", AUTHOR, `select * from post_calls`), /permission denied/);
    await insert("service_role");
    assert.equal((await t.as("service_role", null, `select kind, driver from post_calls`)).length, 1);
  });

  test("one call per post, with a well-formed driver code and a sane count", async () => {
    await assert.rejects(insert("service_role"), /duplicate key/);
    await t.owner(`delete from post_calls`);
    await assert.rejects(insert("service_role", { driver: "nor" }), /post_calls_driver_check/);
    await assert.rejects(insert("service_role", { kind: "teleport" }), /post_calls_kind_check/);
    await assert.rejects(insert("service_role", { kind: "retirements", driver: null, threshold: 0 }), /post_calls_threshold_check/);
  });

  test("a call goes with its post", async () => {
    await t.owner(`delete from post_calls`);
    await insert("service_role");
    await t.owner(`delete from group_posts where id = $1`, [POST]);
    assert.equal((await t.owner(`select 1 from post_calls`)).length, 0);
  });
});
