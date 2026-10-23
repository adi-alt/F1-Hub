// scripts/local-db/load.ts (audit R-21/R-27): the disposable database the browser tests and the restore
// drill use in CI must keep loading as the schema changes, and must hold what they rely on. Loaded into
// PGlite here, the same way CI loads it into a Postgres service container.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { generateIdentity, identityToRecipient } from "age-encryption";
import { loadLocalDb } from "../../../../scripts/local-db/load";
import { dump, open, restoreToScratch, seal } from "../../../../scripts/lib/backup.mjs";

describe("the local test database", () => {
  const db = new PGlite();
  const query = async (sql: string, params?: unknown[]) => (params ? db.query<Record<string, unknown>>(sql, params) : ((await db.exec(sql)).at(-1) ?? { rows: [] }));
  before(async () => {
    await loadLocalDb(query);
  });
  after(() => db.close());

  test("has the four seeded users the browser tests sign in as", async () => {
    const { rows } = await db.query<{ email: string }>(`select email from profiles where email like 'seed-%@seed.invalid' order by email`);
    assert.deepEqual(rows.map((r) => r.email), ["seed-alex@seed.invalid", "seed-blair@seed.invalid", "seed-casey@seed.invalid", "seed-dana@seed.invalid"]);
  });

  test("has a resolved, a locked and an open prediction round", async () => {
    const { rows } = await db.query<{ status: string }>(`select distinct status from group_predictions order by status`);
    assert.deepEqual(rows.map((r) => r.status), ["locked", "open", "resolved"]);
  });

  test("the restore drill dumps it, restores it into a scratch schema, and every table matches", async () => {
    const identity = await generateIdentity();
    const data = await open(await seal(await dump(db), await identityToRecipient(identity)), identity);
    const results = await restoreToScratch(db, data, "drill_test");
    assert.ok(results.length > 5);
    assert.deepEqual(results.filter((r) => !r.ok), []);
    assert.equal(data.auth.users.length, 4);
  });
});
