// "Report a problem": the checks, and the routes against the in-memory Supabase fake (session, rate limiter and
// notifications stubbed). Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";
import { cleanContext, pageFromUrl, screenshotError, validateReport } from "../problemReports";

let session: { uid?: string } = {};
const notified: { id: string; kindLabel: string }[] = [];
mockModule("@/lib/session/getSession", { getSession: async () => session });
mockModule("@/lib/rateLimit", { limitRequest: async () => null });
mockModule("@/lib/notificationEvents", { notifyProblemReport: async (report: { id: string; kindLabel: string }) => void notified.push(report) });

let supabaseAdmin: Record<string, unknown>;
let reports: typeof import("../../app/api/problem-reports/route");
let one: typeof import("../../app/api/problem-reports/[id]/route");
let fake: FakeSupabase;

before(async () => {
  supabaseAdmin = (await import("../supabase/admin")).supabaseAdmin as unknown as Record<string, unknown>;
  reports = await import("../../app/api/problem-reports/route");
  one = await import("../../app/api/problem-reports/[id]/route");
});

beforeEach(() => {
  fake = new FakeSupabase();
  let n = 0;
  fake.defaults.problem_reports = () => ({ id: `report-${++n}`, status: "open", created_at: new Date().toISOString() });
  fake.seed("profiles", { id: "user", role: null, email: "u@x.test" }, { id: "admin", role: "admin", email: "a@x.test" });
  Object.assign(supabaseAdmin, { from: (t: string) => fake.from(t) });
  notified.length = 0;
});

const as = (uid?: string) => (session = uid ? { uid } : {});
function form(fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://x/api/problem-reports", { method: "POST", body });
}
const valid = { kind: "data", description: "The standings show the wrong points", context: JSON.stringify({ url: "https://apex.test/?section=season", viewport: "390x844", junk: "x" }) };
const params = { params: Promise.resolve({ id: "report-1" }) };
const patch = (status: unknown) => new Request("http://x", { method: "PATCH", body: JSON.stringify({ status }) });

describe("problem report checks", () => {
  test("kind and description are required, 10-2000 characters", () => {
    assert.deepEqual(validateReport({ kind: "nope", description: "long enough text", context: null }), { error: "Choose what kind of problem it is." });
    assert.ok("error" in validateReport({ kind: "other", description: "  short   ", context: null }));
    assert.ok("error" in validateReport({ kind: "other", description: "x".repeat(2001), context: null }));
    assert.deepEqual(validateReport({ kind: "other", description: "  long enough text ", context: null }), { kind: "other", description: "long enough text", context: {} });
  });
  test("context keeps known string keys only, capped", () => {
    assert.deepEqual(cleanContext({ url: "u", viewport: 3, junk: "j", error: "e".repeat(900) }), { url: "u", error: "e".repeat(500) });
    assert.equal(pageFromUrl("https://apex.test/races/x?section=y#z"), "/races/x?section=y");
  });
  test("screenshots are PNG, JPEG or WebP under 1 MB", () => {
    assert.equal(screenshotError({ type: "image/png", size: 1000 }), null);
    assert.ok(screenshotError({ type: "image/gif", size: 1000 }));
    assert.ok(screenshotError({ type: "image/png", size: 1024 * 1024 + 1 }));
  });
});

describe("problem report routes", () => {
  test("signed out: every handler answers 401", async () => {
    as();
    assert.equal((await reports.POST(form(valid))).status, 401);
    assert.equal((await reports.GET(new Request("http://x"))).status, 401);
    assert.equal((await one.PATCH(patch("resolved"), params)).status, 401);
  });

  test("a signed-in person reports a problem; the admins are told", async () => {
    as("user");
    const res = await reports.POST(form({ ...valid, screenshot: new File([new Uint8Array([1, 2, 3])], "s.png", { type: "image/png" }) }));
    assert.equal(res.status, 201);
    const row = fake.rows("problem_reports")[0];
    assert.equal(row.user_id, "user");
    assert.equal(row.kind, "data");
    assert.equal(row.page, "/?section=season");
    assert.deepEqual(row.context, { url: "https://apex.test/?section=season", viewport: "390x844" });
    assert.equal(row.screenshot, "data:image/png;base64,AQID");
    assert.deepEqual(notified, [{ id: "report-1", kindLabel: "Wrong data", description: valid.description, page: "/?section=season" }]);
  });

  test("an invalid report is refused and nobody is told", async () => {
    as("user");
    assert.equal((await reports.POST(form({ ...valid, description: "short" }))).status, 400);
    assert.equal((await reports.POST(form({ ...valid, kind: "rant" }))).status, 400);
    assert.equal((await reports.POST(form({ ...valid, screenshot: new File(["x"], "s.gif", { type: "image/gif" }) }))).status, 400);
    assert.equal(fake.rows("problem_reports").length, 0);
    assert.equal(notified.length, 0);
  });

  test("only site admins read and resolve reports", async () => {
    as("user");
    await reports.POST(form(valid));
    assert.equal((await reports.GET(new Request("http://x"))).status, 404);
    assert.equal((await one.PATCH(patch("resolved"), params)).status, 404);
    as("admin");
    const list = await reports.GET(new Request("http://x?status=open&kind=data"));
    assert.equal(list.status, 200);
    assert.equal((await list.json()).reports.length, 1);
    assert.equal((await one.PATCH(patch("closed"), params)).status, 400);
    assert.equal((await one.PATCH(patch("resolved"), params)).status, 200);
    assert.equal(fake.rows("problem_reports")[0].status, "resolved");
    assert.equal((await (await reports.GET(new Request("http://x?status=open"))).json()).reports.length, 0);
  });
});
