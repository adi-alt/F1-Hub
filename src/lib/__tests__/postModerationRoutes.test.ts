// Post/comment edit and delete, reports and the moderation log (audit R-42). Drives the real route handlers against
// the in-memory Supabase fake; the session and the rate limiter are stubbed.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";

let session: { uid?: string } = {};
mockModule("@/lib/session/getSession", { getSession: async () => session });
mockModule("@/lib/rateLimit", { limitRequest: async () => null });
mockModule("@/lib/notificationEvents", { notifyPostModerated: async () => {}, notifyPostPending: async () => {}, notifyReply: async () => {} });

const GROUP = "00000000-0000-4000-8000-000000000100";
const POST = "00000000-0000-4000-8000-000000000200";
const COMMENT = "00000000-0000-4000-8000-000000000300";

let supabaseAdmin: Record<string, unknown>;
let post: typeof import("../../app/api/posts/[postId]/route");
let comment: typeof import("../../app/api/posts/[postId]/comments/[commentId]/route");
let reportRoute: typeof import("../../app/api/posts/[postId]/report/route");
let reports: typeof import("../../app/api/groups/[id]/reports/route");
let resolve: typeof import("../../app/api/groups/[id]/reports/[reportId]/route");
let log: typeof import("../../app/api/groups/[id]/moderation-log/route");
let fake: FakeSupabase;

before(async () => {
  supabaseAdmin = (await import("../supabase/admin")).supabaseAdmin as unknown as Record<string, unknown>;
  post = await import("../../app/api/posts/[postId]/route");
  comment = await import("../../app/api/posts/[postId]/comments/[commentId]/route");
  reportRoute = await import("../../app/api/posts/[postId]/report/route");
  reports = await import("../../app/api/groups/[id]/reports/route");
  resolve = await import("../../app/api/groups/[id]/reports/[reportId]/route");
  log = await import("../../app/api/groups/[id]/moderation-log/route");
});

beforeEach(() => {
  fake = new FakeSupabase();
  let n = 0;
  fake.defaults.group_post_reports = () => ({ id: `report-${++n}`, status: "open", created_at: new Date().toISOString() });
  fake.defaults.group_moderation_log = () => ({ id: `log-${++n}`, created_at: new Date().toISOString() });
  fake.unique.group_post_reports = ["reporter_id", "post_id", "comment_id"];
  fake.seed("profiles", { id: "author", display_name: "Ann" }, { id: "reader", display_name: "Rob" }, { id: "mod", display_name: "Mo" }, { id: "outsider" });
  fake.seed("group_members", { group_id: GROUP, user_id: "author", role: "member" }, { group_id: GROUP, user_id: "reader", role: "member" }, { group_id: GROUP, user_id: "mod", role: "moderator" });
  fake.seed("group_posts", { id: POST, group_id: GROUP, user_id: "author", content: "Norris takes it", status: "published" });
  fake.seed("group_post_comments", { id: COMMENT, post_id: POST, user_id: "reader", content: "No chance", deleted_at: null });
  Object.assign(supabaseAdmin, { from: (t: string) => fake.from(t) });
});

const as = (uid: string) => (session = { uid });
const json = (method: string, body?: unknown) => new Request("http://x", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const postParams = { params: Promise.resolve({ postId: POST }) };
const commentParams = { params: Promise.resolve({ postId: POST, commentId: COMMENT }) };
const groupParams = { params: Promise.resolve({ id: GROUP }) };

describe("editing and deleting posts", () => {
  test("the author edits their post; nobody else can", async () => {
    as("reader");
    assert.equal((await post.PATCH(json("PATCH", { content: "Mine now" }), postParams)).status, 403);
    as("author");
    const res = await post.PATCH(json("PATCH", { content: "  Piastri takes it  " }), postParams);
    assert.equal(res.status, 200);
    const row = fake.rows("group_posts")[0];
    assert.equal(row.content, "Piastri takes it");
    assert.ok(row.edited_at);
  });

  test("the author deletes outright; a moderator removes and it is logged; a member can't", async () => {
    as("reader");
    assert.equal((await post.DELETE(json("DELETE"), postParams)).status, 403);
    as("mod");
    assert.deepEqual(await (await post.DELETE(json("DELETE"), postParams)).json(), { removed: "moderated" });
    assert.equal(fake.rows("group_posts")[0].status, "rejected");
    assert.equal(fake.rows("group_moderation_log")[0].action, "post_removed");
    as("author");
    assert.deepEqual(await (await post.DELETE(json("DELETE"), postParams)).json(), { removed: "deleted" });
    assert.equal(fake.rows("group_posts").length, 0);
  });
});

describe("editing and deleting comments", () => {
  test("the author edits; another member can't", async () => {
    as("author");
    assert.equal((await comment.PATCH(json("PATCH", { content: "Edited" }), commentParams)).status, 403);
    as("reader");
    assert.equal((await comment.PATCH(json("PATCH", { content: "Some chance" }), commentParams)).status, 200);
    assert.equal(fake.rows("group_post_comments")[0].content, "Some chance");
  });

  test("a moderator's delete leaves a logged tombstone; an ordinary member's is refused", async () => {
    as("author");
    assert.equal((await comment.DELETE(json("DELETE"), commentParams)).status, 403);
    as("mod");
    assert.equal((await comment.DELETE(json("DELETE"), commentParams)).status, 200);
    const row = fake.rows("group_post_comments")[0];
    assert.ok(row.deleted_at);
    assert.equal(row.content, "[deleted]");
    assert.equal(fake.rows("group_moderation_log")[0].action, "comment_removed");
    // Gone means gone: it can't be deleted or edited again.
    assert.equal((await comment.DELETE(json("DELETE"), commentParams)).status, 404);
  });

  test("the post author or moderator can pin and accept top-level comments; members can toggle reactions", async () => {
    as("reader");
    assert.equal((await comment.PATCH(json("PATCH", { pinned: true }), commentParams)).status, 403);
    assert.equal((await comment.PATCH(json("PATCH", { accepted: true }), commentParams)).status, 403);
    as("author");
    assert.deepEqual(await (await comment.PATCH(json("PATCH", { pinned: true }), commentParams)).json(), { pinned: true });
    assert.ok(fake.rows("group_post_comments")[0].pinned_at);
    assert.deepEqual(await (await comment.PATCH(json("PATCH", { accepted: true }), commentParams)).json(), { accepted: true });
    assert.ok(fake.rows("group_post_comments")[0].accepted_at);

    as("reader");
    const reactRes = await comment.PATCH(json("PATCH", { reaction: "🔥" }), commentParams);
    assert.equal(reactRes.status, 200);
    assert.deepEqual(await reactRes.json(), { reactions: [{ emoji: "🔥", count: 1, mine: true }] });

    const unreactRes = await comment.PATCH(json("PATCH", { reaction: "🔥" }), commentParams);
    assert.equal(unreactRes.status, 200);
    assert.deepEqual(await unreactRes.json(), { reactions: [] });
  });
});

describe("reports", () => {
  test("a member reports once; outsiders and authors can't", async () => {
    as("outsider");
    assert.equal((await reportRoute.POST(json("POST", { reason: "spam" }), postParams)).status, 403);
    as("author");
    assert.equal((await reportRoute.POST(json("POST", { reason: "spam" }), postParams)).status, 400);
    as("reader");
    assert.equal((await reportRoute.POST(json("POST", { reason: "spam" }), postParams)).status, 200);
    assert.equal((await reportRoute.POST(json("POST", { reason: "spam again" }), postParams)).status, 200);
    assert.equal(fake.rows("group_post_reports").length, 1);
  });

  test("only moderators see the queue; removing takes the post down and logs it", async () => {
    as("reader");
    await reportRoute.POST(json("POST", { reason: "spam" }), postParams);
    assert.equal((await reports.GET(json("GET"), groupParams)).status, 403);
    as("mod");
    const queue = (await (await reports.GET(json("GET"), groupParams)).json()) as { reports: { id: string; reporterName: string; authorName: string }[] };
    assert.equal(queue.reports.length, 1);
    assert.equal(queue.reports[0].reporterName, "Rob");
    assert.equal(queue.reports[0].authorName, "Ann");
    const id = queue.reports[0].id;
    const res = await resolve.POST(json("POST", { action: "remove" }), { params: Promise.resolve({ id: GROUP, reportId: id }) });
    assert.equal(res.status, 200);
    assert.equal(fake.rows("group_posts")[0].status, "rejected");
    assert.equal(fake.rows("group_post_reports")[0].status, "actioned");
    // Already dealt with.
    assert.equal((await resolve.POST(json("POST", { action: "dismiss" }), { params: Promise.resolve({ id: GROUP, reportId: id }) })).status, 409);
    const entries = (await (await log.GET(json("GET"), groupParams)).json()) as { entries: { action: string; actorName: string; targetName: string }[] };
    assert.deepEqual(entries.entries.map((e) => [e.action, e.actorName, e.targetName]), [["post_removed", "Mo", "Ann"]]);
  });
});
