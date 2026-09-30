// Email OTP rules (M0 Batch 3), decided in the database by 20261001_otp_hardening.sql and tested
// here against the real schema. Concurrent submission is in concurrency.pg.test.ts (PGlite cannot
// interleave transactions). src/lib/__tests__/otp.service.test.ts covers the TypeScript side (code
// generation, hashing, log hygiene, error mapping).

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createTestDb, type TestDb } from "./testDb";

const EMAIL = "driver@example.com";
const h = (code: string) => createHash("sha256").update(`test:${code}`).digest("hex"); // stands in for the app's HMAC
const T0 = new Date("2026-10-01T12:00:00Z").getTime();
const at = (secondsAfterT0: number) => new Date(T0 + secondsAfterT0 * 1000).toISOString();

let t: TestDb;
const issue = async (code: string, s: number, email = EMAIL) =>
  (await t.as<{ r: { status: string; retry_after_seconds?: number } }>("service_role", null, `select otp_issue($1, $2, $3::timestamptz) as r`, [email, h(code), at(s)]))[0].r;
const verify = async (code: string, s: number, email = EMAIL) =>
  (await t.as<{ r: string }>("service_role", null, `select otp_verify($1, $2, $3::timestamptz) as r`, [email, h(code), at(s)]))[0].r;
const consume = async (s: number, email = EMAIL) =>
  (await t.as<{ r: boolean }>("service_role", null, `select otp_consume_verification($1, $2::timestamptz) as r`, [email, at(s)]))[0].r;
const row = async (email = EMAIL) => (await t.owner<Record<string, unknown>>(`select * from otp_codes where email = $1`, [email]))[0];

before(async () => {
  t = await createTestDb();
});
after(() => t.close());
beforeEach(async () => {
  await t.owner(`delete from otp_codes`);
});

describe("issuing", () => {
  test("stores only the hash - never a plaintext code", async () => {
    assert.deepEqual(await issue("123456", 0), { status: "issued" });
    const r = await row();
    assert.equal(r.code, null);
    assert.equal(r.code_hash, h("123456"));
    assert.ok(!JSON.stringify(r).includes("123456"));
  });

  test("a resend within 60 seconds is a cooldown and leaves the live code untouched", async () => {
    await issue("123456", 0);
    assert.deepEqual(await issue("654321", 30), { status: "cooldown", retry_after_seconds: 30 });
    assert.equal((await row()).code_hash, h("123456"));
    assert.equal(await verify("123456", 40), "ok");
  });

  test("at most 5 codes per hour; the window reopens an hour after it started", async () => {
    for (let i = 0; i < 5; i++) assert.equal((await issue(String(100000 + i), i * 61)).status, "issued");
    const refused = await issue("999999", 5 * 61);
    assert.equal(refused.status, "throttled");
    assert.equal(refused.retry_after_seconds, 3600 - 5 * 61);
    assert.equal((await issue("999999", 3600)).status, "issued");
  });

  test("the address is normalised, so case and whitespace cannot dodge the limits", async () => {
    await issue("123456", 0, "Driver@Example.com ");
    assert.equal((await issue("654321", 10, "driver@example.com")).status, "cooldown");
    assert.equal(await verify("123456", 20, " DRIVER@example.COM"), "ok");
  });

  test("rejects an empty address or a value that is not a hash", async () => {
    await assert.rejects(t.as("service_role", null, `select otp_issue('', $1)`, [h("1")]), /otp_invalid_arguments/);
    await assert.rejects(t.as("service_role", null, `select otp_issue($1, '123456')`, [EMAIL]), /otp_invalid_arguments/);
  });
});

describe("verifying", () => {
  test("SUCCESS: the right code within 10 minutes verifies", async () => {
    await issue("123456", 0);
    assert.equal(await verify("123456", 599), "ok");
    const r = await row();
    assert.equal(r.verified, true);
    assert.equal(r.code_hash, null, "spent");
  });

  test("EXPIRED: 10 minutes after issue the code is dead, right or not", async () => {
    await issue("123456", 0);
    assert.equal(await verify("123456", 600), "expired");
    assert.equal(await verify("123456", 601), "expired");
  });

  test("INVALID: a wrong code is counted and refused", async () => {
    await issue("123456", 0);
    assert.equal(await verify("000000", 10), "wrong");
    assert.equal((await row()).attempts, 1);
    assert.equal(await verify("123456", 20), "ok", "the right code still works after one miss");
  });

  test("REUSED: a code verifies once; replaying it is refused", async () => {
    await issue("123456", 0);
    assert.equal(await verify("123456", 10), "ok");
    assert.equal(await verify("123456", 11), "used");
    assert.equal(await verify("000000", 12), "used", "no further guessing against a spent code either");
  });

  test("BRUTE FORCE: after 5 wrong guesses even the right code is refused", async () => {
    await issue("123456", 0);
    for (let i = 0; i < 5; i++) assert.equal(await verify(String(200000 + i), 10 + i), "wrong");
    assert.equal(await verify("123456", 20), "too-many");
  });

  test("BRUTE FORCE via resends: failed guesses accumulate per hour across codes, so resending buys nothing", async () => {
    await issue("111111", 0);
    for (let i = 0; i < 5; i++) await verify(String(200000 + i), 1 + i);
    await issue("222222", 61); // a fresh code: 5 per-code guesses again ...
    for (let i = 0; i < 5; i++) assert.equal(await verify(String(300000 + i), 62 + i), "wrong");
    assert.equal(await verify("222222", 70), "too-many", "... but the hour's 10 failures are used up");
    assert.equal((await issue("333333", 140)).status, "throttled", "and no new code until the window ends");
    assert.equal((await issue("444444", 3600)).status, "issued");
    assert.equal(await verify("444444", 3601), "ok");
  });

  test("no code ever issued, or a legacy plaintext row, verifies as expired", async () => {
    assert.equal(await verify("123456", 0), "expired");
    await t.owner(`insert into otp_codes (email, code, expires_at, sent_at) values ($1, '123456', $2::timestamptz, $3::timestamptz)`, [EMAIL, at(600), at(0)]);
    assert.equal(await verify("123456", 10), "expired");
  });

  test("a new code resets the previous verification", async () => {
    await issue("123456", 0);
    await verify("123456", 5);
    await issue("654321", 70);
    assert.equal((await row()).verified, false);
    assert.equal(await consume(71), false);
  });
});

describe("complete-signup's verification window", () => {
  test("spendable once, within 10 minutes of verifying", async () => {
    await issue("123456", 0);
    assert.equal(await consume(1), false, "nothing verified yet");
    await verify("123456", 10);
    assert.equal(await consume(20), true);
    assert.equal(await consume(21), false, "replay refused");
  });

  test("expires 10 minutes after verification", async () => {
    await issue("123456", 0);
    await verify("123456", 10);
    assert.equal(await consume(10 + 600), false);
  });
});

describe("access", () => {
  test("clients can neither call the functions nor read the table", async () => {
    await issue("123456", 0);
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(t.as(role, null, `select otp_verify($1, $2)`, [EMAIL, h("123456")]), /permission denied/);
      await assert.rejects(t.as(role, null, `select otp_issue($1, $2)`, [EMAIL, h("123456")]), /permission denied/);
      await assert.rejects(t.as(role, null, `select otp_consume_verification($1)`, [EMAIL]), /permission denied/);
      await assert.rejects(t.as(role, null, `select * from otp_codes`), /permission denied/);
    }
  });
});

describe("migration", () => {
  test("clears plaintext codes already in the table and is safe to re-run", async () => {
    const legacy = await createTestDb({ upTo: "20261001_otp_hardening.sql" });
    try {
      await legacy.owner(`insert into otp_codes (email, code, expires_at, sent_at) values ($1, '123456', now() + interval '5 minutes', now())`, [EMAIL]);
      const sql = fs.readFileSync(path.resolve(__dirname, "../../../../supabase/migrations/20261001_otp_hardening.sql"), "utf8");
      await legacy.db.exec(sql);
      await legacy.db.exec(sql);
      const [r] = await legacy.owner<{ code: string | null; code_hash: string | null }>(`select code, code_hash from otp_codes`);
      assert.deepEqual(r, { code: null, code_hash: null });
    } finally {
      await legacy.close();
    }
  });
});
