// supabase/migrations/20261004_rate_limits.sql (audit R-14): the counter function behaves as a fixed
// window limiter, and neither it nor the internal tables are reachable by a browser's roles.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, type TestDb } from "./testDb";

type Row = { allowed: boolean; hits: number; retry_after_seconds: number };
const hit = (t: TestDb, key: string, limit: number, windowSeconds: number) =>
  t.as<Row>("service_role", null, "select * from rate_limit_hit($1, $2, $3)", [key, limit, windowSeconds]).then((rows) => rows[0]);

async function rejects(p: Promise<unknown>) {
  await assert.rejects(p, /permission denied|violates row-level security/);
}

describe("rate_limit_hit", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
  });
  after(() => t.close());

  test("allows up to the limit, then denies, and says how long until the window resets", async () => {
    const seen: Row[] = [];
    for (let i = 0; i < 5; i++) seen.push(await hit(t, "link-preview:alice", 3, 60));
    assert.deepEqual(seen.map((r) => [r.hits, r.allowed]), [[1, true], [2, true], [3, true], [4, false], [5, false]]);
    assert.ok(seen[3].retry_after_seconds >= 1 && seen[3].retry_after_seconds <= 60);
  });

  test("counts each key separately", async () => {
    await hit(t, "k:a", 1, 60);
    assert.equal((await hit(t, "k:a", 1, 60)).allowed, false);
    assert.equal((await hit(t, "k:b", 1, 60)).allowed, true);
  });

  test("starts a new window once the old one has expired", async () => {
    await hit(t, "k:expiring", 1, 60);
    assert.equal((await hit(t, "k:expiring", 1, 60)).allowed, false);
    await t.owner(`update rate_limits set window_start = now() - interval '61 seconds' where key = 'k:expiring'`);
    const fresh = await hit(t, "k:expiring", 1, 60);
    assert.equal(fresh.hits, 1);
    assert.equal(fresh.allowed, true);
  });

  test("the hourly purge clears only windows that are long dead", async () => {
    await t.owner(`insert into rate_limits (key, window_start, hits) values ('old', now() - interval '3 days', 9), ('recent', now() - interval '1 hour', 9)`);
    const job = await t.owner<{ command: string }>(`select command from cron.job where jobname = 'purge-rate-limits'`);
    assert.equal(job.length, 1);
    await t.owner(job[0].command);
    const left = (await t.owner<{ key: string }>(`select key from rate_limits where key in ('old', 'recent')`)).map((r) => r.key);
    assert.deepEqual(left, ["recent"]);
  });
});

describe("who can reach it", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
  });
  after(() => t.close());

  test("a browser's roles can't call the function or read the internal tables", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await rejects(t.as(role, null, "select * from rate_limit_hit('x', 1, 60)"));
      await rejects(t.as(role, null, "select * from rate_limits"));
      await rejects(t.as(role, null, "insert into rate_limits (key) values ('x')"));
      await rejects(t.as(role, null, "select * from pipeline_runs"));
      await rejects(t.as(role, null, "insert into pipeline_runs (job, status) values ('x', 'success')"));
    }
  });

  test("the server can read and write the pipeline run ledger, and it rejects an unknown status", async () => {
    await t.as("service_role", null, "insert into pipeline_runs (job, status) values ('fetch-races', 'success')");
    assert.equal((await t.as("service_role", null, "select count(*)::int as n from pipeline_runs"))[0].n, 1);
    await assert.rejects(t.as("service_role", null, "insert into pipeline_runs (job, status) values ('fetch-races', 'weird')"), /violates check constraint/);
  });
});
