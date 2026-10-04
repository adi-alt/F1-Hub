// The durable limiter (audit R-14): policies, the 429, the IP fallback, failing open or closed, the AI
// quota and the AI_DISABLED kill switch. The database is FakeSupabase with a scripted rate_limit_hit.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";

mockModule("@sentry/nextjs", { captureException: () => {} });
mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });

let lib: typeof import("../rateLimit");
let guardrails: typeof import("../ai/guardrails");
let fake: FakeSupabase;
const calls: { key: string; limit: number; window: number }[] = [];
let denyKeys: Set<string>;
let breakDb = false;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  lib = await import("../rateLimit");
  guardrails = await import("../ai/guardrails");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { rpc: (fn: string, args: Record<string, unknown>) => fake.rpc(fn, args) });
});

beforeEach(() => {
  fake = new FakeSupabase();
  calls.length = 0;
  denyKeys = new Set();
  breakDb = false;
  delete process.env.AI_DISABLED;
  fake.rpcs.rate_limit_hit = (args) => {
    if (breakDb) return { data: null, error: { message: "connection refused" } };
    calls.push({ key: args.p_key as string, limit: args.p_limit as number, window: args.p_window_seconds as number });
    const denied = denyKeys.has(args.p_key as string);
    return { data: [{ allowed: !denied, hits: denied ? 99 : 1, retry_after_seconds: 42 }], error: null };
  };
});

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/x", { headers });

describe("hit and limitRequest", () => {
  it("keys the counter by policy and subject, with the policy's own numbers", async () => {
    await lib.hit("linkPreview", "user-1");
    assert.deepEqual(calls[0], { key: "linkPreview:user-1", limit: 30, window: 60 });
  });

  it("answers 429 with Retry-After once the limit is passed", async () => {
    denyKeys.add("postCreate:user-1");
    const res = await lib.limitRequest(req(), "postCreate", "user-1");
    assert.equal(res?.status, 429);
    assert.equal(res?.headers.get("Retry-After"), "42");
    assert.deepEqual(await res?.json(), { error: "Too many requests. Try again shortly.", retryAfterSeconds: 42 });
  });

  it("lets a request within the limit through", async () => {
    assert.equal(await lib.limitRequest(req(), "postCreate", "user-1"), null);
  });

  it("keys an IP policy on the caller's address, whoever they claim to be", async () => {
    await lib.limitRequest(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), "usernameCheck", "user-1");
    assert.equal(calls[0].key, "usernameCheck:203.0.113.9");
  });

  it("falls back to the IP for a user policy with no session, so a missing session is not a free pass", async () => {
    await lib.limitRequest(req({ "x-real-ip": "198.51.100.4" }), "linkPreview", null);
    assert.equal(calls[0].key, "linkPreview:198.51.100.4");
  });

  it("fails open when the database is down, and closed when asked to", async () => {
    breakDb = true;
    assert.equal(await lib.limitRequest(req(), "postCreate", "u"), null);
    assert.equal((await lib.limitRequest(req(), "postCreate", "u", { failClosed: true }))?.status, 429);
  });
});

describe("AI quota", () => {
  it("limits a signed-in user by burst and by day", async () => {
    const ok = await guardrails.checkUserRateLimit("user-1");
    assert.equal(ok.allowed, true);
    assert.deepEqual(calls.map((c) => c.key), ["aiBurst:user-1", "aiDaily:user-1"]);
    denyKeys.add("aiDaily:user-1");
    const out = await guardrails.checkUserRateLimit("user-1");
    assert.deepEqual([out.allowed, out.reason, out.retryAfterSeconds], [false, "USER_RATE_LIMITED", 42]);
  });

  it("limits an anonymous caller by IP, which the old limiter skipped", async () => {
    await guardrails.checkUserRateLimit("ip:203.0.113.9");
    assert.deepEqual(calls.map((c) => c.key), ["aiAnonymous:203.0.113.9"]);
    const guard = await guardrails.guardAIExecution(null, req({ "x-forwarded-for": "203.0.113.9" }));
    assert.equal(guard.allowed, true);
    denyKeys.add("aiAnonymous:203.0.113.9");
    assert.equal((await guardrails.guardAIExecution(null, req({ "x-forwarded-for": "203.0.113.9" }))).reason, "USER_RATE_LIMITED");
  });

  it("AI_DISABLED stops every guard before it touches the database", async () => {
    process.env.AI_DISABLED = "1";
    const guard = await guardrails.guardAIExecution("user-1", req());
    assert.deepEqual([guard.allowed, guard.reason], [false, "AI_DISABLED"]);
    assert.equal((await guardrails.checkUserRateLimit("user-1")).reason, "AI_DISABLED");
    assert.equal(calls.length, 0);
  });
});
