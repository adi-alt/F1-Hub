// supabase/migrations/20261005_data_version.sql (audit R-19): browsers can read the freshness counters
// and subscribe to them, and cannot write them.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createTestDb, type TestDb } from "./testDb";

describe("data_version", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
  });
  after(() => t.close());

  test("starts with one counter per tag the browser refreshes for", async () => {
    const rows = await t.owner<{ tag: string; version: string }>("select tag, version from data_version order by tag");
    assert.deepEqual(rows.map((r) => r.tag), ["calendar", "media", "races"]);
    assert.ok(rows.every((r) => Number(r.version) === 0));
  });

  test("anyone can read it, including a signed-out visitor", async () => {
    const rows = await t.as<{ tag: string }>("anon", null, "select tag from data_version");
    assert.equal(rows.length, 3);
  });

  test("a browser role cannot bump, change or remove a counter", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      for (const sql of ["update data_version set version = 99", "delete from data_version", "insert into data_version (tag) values ('x')"]) {
        await assert.rejects(t.as(role, role === "anon" ? null : "00000000-0000-0000-0000-000000000001", sql), /permission denied|violates row-level security/, `${role}: ${sql}`);
      }
    }
  });

  test("the service role (the pipeline) can bump it", async () => {
    await t.as("service_role", null, "update data_version set version = version + 1, updated_at = now() where tag = 'races'");
    const [row] = await t.owner<{ version: string }>("select version from data_version where tag = 'races'");
    assert.equal(Number(row.version), 1);
  });

  test("the migration can be applied twice", async () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261005_data_version.sql"), "utf8");
    await t.db.exec(sql);
    const rows = await t.owner<{ tag: string }>("select tag from data_version");
    assert.equal(rows.length, 3);
  });
});
