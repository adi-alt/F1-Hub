// Email OTP, TypeScript side (M0 Batch 3): code generation, what reaches the database (a keyed hash,
// never the code), what reaches the logs (a masked address, never the code), and how each database
// outcome maps to the API response. The rules themselves (expiry, single use, attempt and resend
// limits) are the database's and are tested in db/otp.test.ts and db/concurrency.pg.test.ts.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, type Row } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";
import { ServiceError } from "../../services/errors";

process.env.SESSION_SECRET = "otp-test-secret-0123456789abcdef-0123456789";
process.env.SMTP_HOST = "smtp.test.local";
process.env.SMTP_USER = "resend";
process.env.SMTP_PASS = "test";
process.env.MAIL_FROM = "noreply@test.local";

const EMAIL = "Driver.One@Example.com";
let sent: { to: string; subject: string; text: string }[] = [];
let sendFails = false;
let profileExists = false;
const created: string[] = [];

mockModule("nodemailer", {
  default: {
    createTransport: () => ({
      sendMail: async (m: { to: string; subject: string; text: string }) => {
        if (sendFails) throw Object.assign(new Error(`Recipient <${m.to.toLowerCase()}> rejected`), { code: "EENVELOPE", responseCode: 550 });
        sent.push(m);
        return { accepted: [m.to], rejected: [], response: `250 OK queued for ${m.to}` };
      },
    }),
  },
});
mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });
mockModule("@/lib/supabase/server", { getSupabaseUser: async () => ({ id: "user-1", email: EMAIL, user_metadata: {} }) });
mockModule("@/lib/session/createSession", { createSessionFor: async () => "user" });
mockModule("@/lib/supabase/users", {
  getUserProfile: async () => (profileExists ? { firstName: "Max" } : null),
  isUsernameTaken: async (u: string) => u === "taken_name",
  createUserProfile: async (id: string) => {
    created.push(id);
  },
});

let otp: typeof import("../otp");
let auth: typeof import("../../services/auth.service");
let fake: FakeSupabase;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t), rpc: (fn: string, a?: Row) => fake.rpc(fn, a) });
  otp = await import("../otp");
  auth = await import("../../services/auth.service");
});

let logs: string[];
const originalLog = console.log;
const originalError = console.error;
beforeEach(() => {
  fake = new FakeSupabase();
  sent = [];
  sendFails = false;
  profileExists = false;
  created.length = 0;
  logs = [];
  console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
});
after(() => {
  console.log = originalLog;
  console.error = originalError;
});

async function rejectsWith(p: Promise<unknown>, status: number, code?: string) {
  await assert.rejects(p, (err: unknown) => err instanceof ServiceError && err.httpStatus === status && (code === undefined || err.code === code));
}

describe("code generation and hashing", () => {
  test("codes are 6 digits over the full 000000-999999 range, from the CSPRNG (not Math.random)", () => {
    const realRandom = Math.random;
    Math.random = () => {
      throw new Error("Math.random must not be used for OTP codes");
    };
    try {
      const codes = Array.from({ length: 3000 }, () => otp.generateOtpCode());
      assert.ok(codes.every((c) => /^[0-9]{6}$/.test(c)));
      assert.ok(codes.some((c) => c.startsWith("0")), "leading zeros occur (the old generator never produced codes below 100000)");
      assert.ok(new Set(codes).size > 2900, "no obvious repetition");
    } finally {
      Math.random = realRandom;
    }
  });

  test("the hash is keyed, bound to the address, and case-insensitive in the address", () => {
    const a = otp.hashOtpCode(EMAIL, "123456");
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, otp.hashOtpCode("driver.one@example.com", "123456"));
    assert.notEqual(a, otp.hashOtpCode("someone@else.com", "123456"));
    assert.notEqual(a, otp.hashOtpCode(EMAIL, "123457"));
    const secret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "a-different-secret-0123456789abcdef-012345";
    try {
      assert.notEqual(otp.hashOtpCode(EMAIL, "123456"), a, "without the server secret the hash cannot be recomputed");
      process.env.SESSION_SECRET = "short";
      assert.throws(() => otp.hashOtpCode(EMAIL, "123456"), /SESSION_SECRET/, "fails closed without a proper secret");
    } finally {
      process.env.SESSION_SECRET = secret;
    }
  });

  test("masked addresses keep the domain and one character only", () => {
    assert.equal(otp.maskEmail("driver.one@example.com"), "d***@example.com");
    assert.equal(otp.maskEmail("not-an-address"), "***");
  });
});

describe("prepareOtp / verifyOtp", () => {
  test("the database receives the keyed hash of the code, never the code", async () => {
    fake.rpcs.otp_issue = () => ({ data: { status: "issued" }, error: null });
    const r = await otp.prepareOtp(EMAIL);
    assert.equal(r.status, "issued");
    const code = (r as { code: string }).code;
    const [call] = fake.rpcCalls;
    assert.deepEqual(call, { fn: "otp_issue", args: { p_email: "driver.one@example.com", p_code_hash: otp.hashOtpCode(EMAIL, code) } });
    assert.ok(!JSON.stringify(fake.rpcCalls).includes(code));
  });

  test("cooldown and throttling come back with their retry time", async () => {
    fake.rpcs.otp_issue = () => ({ data: { status: "throttled", retry_after_seconds: 1500 }, error: null });
    assert.deepEqual(await otp.prepareOtp(EMAIL), { status: "throttled", retryAfterSeconds: 1500 });
    fake.rpcs.otp_issue = () => ({ data: { status: "cooldown", retry_after_seconds: 20 }, error: null });
    assert.deepEqual(await otp.prepareOtp(EMAIL), { status: "cooldown", retryAfterSeconds: 20 });
  });

  test("a database error is an error, not a silently-unsent code", async () => {
    fake.rpcs.otp_issue = () => ({ data: null, error: { message: "boom" } });
    await assert.rejects(otp.prepareOtp(EMAIL), /prepareOtp: boom/);
  });

  test("verification sends the hash of the submitted code; malformed input still counts as a guess", async () => {
    fake.rpcs.otp_verify = () => ({ data: "wrong", error: null });
    assert.equal(await otp.verifyOtp(EMAIL, " 123456 "), "wrong");
    assert.equal(fake.rpcCalls[0].args.p_code_hash, otp.hashOtpCode(EMAIL, "123456"));
    await otp.verifyOtp(EMAIL, "12' or 1=1 --");
    assert.equal(fake.rpcCalls.length, 2, "malformed input is still submitted (and counted), never skipped for free");
    assert.equal(fake.rpcCalls[1].args.p_code_hash, otp.hashOtpCode(EMAIL, "invalid"));
  });
});

describe("delivery logs", () => {
  test("never contain the code or the full address", async () => {
    await otp.deliverOtp(EMAIL, "482913");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, EMAIL);
    const all = logs.join("\n");
    assert.ok(all.includes("D***@Example.com"), all);
    assert.ok(!all.includes("482913"), "code in logs");
    assert.ok(!all.toLowerCase().includes("driver.one"), "address in logs");
  });

  test("a failed send is logged without the address either", async () => {
    sendFails = true;
    await otp.deliverOtp(EMAIL, "482913");
    const all = logs.join("\n");
    assert.ok(all.includes("FAILED") && all.includes("EENVELOPE"), all);
    assert.ok(!all.includes("482913") && !all.toLowerCase().includes("driver.one"), all);
  });
});

describe("auth.service mapping", () => {
  test("start: a fresh code is returned for delivery; a cooldown is not an error", async () => {
    fake.rpcs.otp_issue = () => ({ data: { status: "issued" }, error: null });
    const issued = await auth.startSignIn();
    assert.match(issued.code ?? "", /^[0-9]{6}$/);
    fake.rpcs.otp_issue = () => ({ data: { status: "cooldown", retry_after_seconds: 30 }, error: null });
    assert.deepEqual(await auth.startSignIn(), { email: EMAIL, code: null });
  });

  test("start: the hourly limit is a 429 with a stable code", async () => {
    fake.rpcs.otp_issue = () => ({ data: { status: "throttled", retry_after_seconds: 1500 }, error: null });
    await rejectsWith(auth.startSignIn(), 429, "otp_throttled");
  });

  for (const [result, status, code] of [["expired", 400, "otp_expired"], ["wrong", 400, "otp_wrong"], ["used", 400, "otp_used"], ["too-many", 429, "otp_too_many"]] as const) {
    test(`verify: "${result}" -> ${status} ${code}, and no session`, async () => {
      fake.rpcs.otp_verify = () => ({ data: result, error: null });
      await rejectsWith(auth.verifyOtpAndLogin("123456"), status, code);
    });
  }

  test("verify: success logs an existing user in", async () => {
    profileExists = true;
    fake.rpcs.otp_verify = () => ({ data: "ok", error: null });
    assert.equal((await auth.verifyOtpAndLogin("123456")).status, "logged-in");
  });

  const signup = { firstName: "Max", lastName: "V", username: "max_v" };
  const verifiedRow = (over: Row = {}) => ({ email: "driver.one@example.com", verified: true, verified_at: new Date().toISOString(), verification_consumed_at: null, ...over });

  test("complete-signup: refused without a verification, before anything is written", async () => {
    await rejectsWith(auth.completeSignup(signup), 403);
    assert.equal(created.length, 0);
    assert.equal(fake.rpcCalls.length, 0);
  });

  test("complete-signup: the verification is spent atomically - if it was already spent, no profile is created", async () => {
    fake.seed("otp_codes", verifiedRow());
    fake.rpcs.otp_consume_verification = () => ({ data: false, error: null }); // a concurrent request won
    await rejectsWith(auth.completeSignup(signup), 403);
    assert.equal(created.length, 0);
  });

  test("complete-signup: a validation failure does not spend the verification", async () => {
    fake.seed("otp_codes", verifiedRow());
    fake.rpcs.otp_consume_verification = () => ({ data: true, error: null });
    await rejectsWith(auth.completeSignup({ ...signup, username: "taken_name" }), 409);
    assert.equal(fake.rpcCalls.length, 0);
  });

  test("complete-signup: success spends the verification once and creates the profile", async () => {
    fake.seed("otp_codes", verifiedRow());
    fake.rpcs.otp_consume_verification = () => ({ data: true, error: null });
    assert.equal((await auth.completeSignup(signup)).status, "logged-in");
    assert.deepEqual(fake.rpcCalls.map((c) => c.fn), ["otp_consume_verification"]);
    assert.deepEqual(created, ["user-1"]);
    assert.equal(fake.rows("otp_codes").length, 1, "the row is kept (deleting it would reset the hourly limits)");
  });

  test("complete-signup: an already-consumed or stale verification fails the early check", async () => {
    fake.seed("otp_codes", verifiedRow({ verification_consumed_at: new Date().toISOString() }));
    await rejectsWith(auth.completeSignup(signup), 403);
    fake.tables.otp_codes = [verifiedRow({ verified_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() })];
    await rejectsWith(auth.completeSignup(signup), 403);
  });
});
