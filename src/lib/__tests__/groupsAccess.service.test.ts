// Service-layer tests for community join authorization, invitations, bans and invite emails
// (audit SEC-06 / SEC-11, M0 Batch 2). These exercise the REAL src/lib/supabase/groups.ts against an
// in-memory fake client, so they cover what lives in TypeScript: who is allowed to do what, that a
// token is verified BEFORE any database call, error mapping, ordering (ban before removal), and the
// contents of invite emails. What the join/redeem SQL functions decide is tested against a real
// schema in src/lib/__tests__/db/groupAccess.test.ts.
//
// Run with --experimental-test-module-mocks (see the `test` script): next/cache and nodemailer are
// stubbed so the service modules load and run outside a Next.js runtime.

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, newId, type Row } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";
import { signInviteToken, verifyInviteToken } from "../inviteTokens";
import { ServiceError } from "../../services/errors";

process.env.SESSION_SECRET = "service-test-secret-0123456789abcdef";
process.env.SMTP_HOST = "smtp.test.invalid";
process.env.SMTP_USER = "resend";
process.env.SMTP_PASS = "not-a-real-password";
process.env.MAIL_FROM = "noreply@test.invalid";
delete process.env.APP_BASE_URL;

const revalidated: string[] = [];
type Mail = { to: string; subject: string; text: string; html: string; from: string };
const sent: Mail[] = [];
mockModule("next/cache", {
  revalidateTag: (tag: string) => {
    revalidated.push(tag);
  },
  unstable_cache: (fn: unknown) => fn,
});
const mockTransport = {
  createTransport: () => ({
    sendMail: async (mail: Mail) => {
      sent.push(mail);
      return { accepted: [mail.to], rejected: [], response: "250 ok" };
    },
  }),
};
mockModule("nodemailer", { default: mockTransport, ...mockTransport });

const ADMIN = newId();
const MOD = newId();
const MEMBER = newId();
const OUTSIDER = newId();
const VICTIM = newId();
const PRIVATE = newId();
const PUBLIC = newId();
const OTHER_PRIVATE = newId();

let groups: typeof import("../supabase/groups");
let fake: FakeSupabase;

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  groups = await import("../supabase/groups");
  // The one client every service module imports; replace its data methods with the fake's.
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t), rpc: (fn: string, a?: Row) => fake.rpc(fn, a) });
});

beforeEach(() => {
  revalidated.length = 0;
  sent.length = 0;
  delete process.env.APP_BASE_URL;
  fake = new FakeSupabase();
  fake.defaults.group_invites = () => ({ id: newId(), use_count: 0, revoked_at: null, revoked_by: null, created_at: new Date().toISOString() });
  fake.unique.group_members = ["group_id", "user_id"];
  fake.seed(
    "profiles",
    { id: ADMIN, display_name: "Ada Admin", username: "ada", points_balance: 100 },
    { id: MOD, display_name: "Mo Mod", username: "mo", points_balance: 100 },
    { id: MEMBER, display_name: "Mia Member", username: "mia", points_balance: 100 },
    { id: OUTSIDER, display_name: "Otto Outsider", username: "otto", points_balance: 100 },
    { id: VICTIM, display_name: "Vic Victim", username: "vic", points_balance: 100 },
  );
  fake.seed(
    "groups",
    { id: PRIVATE, name: "Private Club", visibility: "private", permissions: null, created_by: ADMIN },
    { id: PUBLIC, name: "Open House", visibility: "public", permissions: null, created_by: ADMIN },
    { id: OTHER_PRIVATE, name: "Other Club", visibility: "private", permissions: null, created_by: ADMIN },
  );
  for (const group of [PRIVATE, PUBLIC, OTHER_PRIVATE]) {
    fake.seed("group_members", { group_id: group, user_id: ADMIN, role: "admin" }, { group_id: group, user_id: MOD, role: "moderator" }, { group_id: group, user_id: MEMBER, role: "member" });
  }
});

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new assert.AssertionError({ message: "expected the call to be rejected" });
}
const serviceError = async (promise: Promise<unknown>) => {
  const err = await rejection(promise);
  assert.ok(err instanceof ServiceError, `expected a ServiceError, got ${err.constructor.name}: ${err.message}`);
  return err;
};

const tokenFor = (group: string, inviteId = newId(), expiresAt = new Date(Date.now() + 86_400_000)) => signInviteToken({ inviteId, groupId: group, expiresAt });

describe("joinGroup", () => {
  test("without a token it asks the database to join a public community, and reports success", async () => {
    fake.rpcs.join_group = () => ({ data: { joined: true, alreadyMember: false }, error: null });
    const res = await groups.joinGroup(OUTSIDER, PUBLIC);
    assert.deepEqual(res, { id: PUBLIC, name: "Open House" });
    assert.deepEqual(fake.rpcCalls.map((c) => c.fn), ["join_group"]);
    assert.deepEqual(fake.rpcCalls[0].args, { p_group_id: PUBLIC, p_user_id: OUTSIDER });
    assert.equal(revalidated.length, 1, "discovery cache is refreshed when someone actually joined");
  });

  test("already a member: succeeds and does not refresh the discovery cache", async () => {
    fake.rpcs.join_group = () => ({ data: { joined: false, alreadyMember: true }, error: null });
    await groups.joinGroup(MEMBER, PUBLIC);
    assert.equal(revalidated.length, 0);
  });

  test("THE BYPASS: a private community without a token is refused with a code the UI can act on", async () => {
    fake.rpcs.join_group = () => ({ data: null, error: { message: "invite_required" } });
    const err = await serviceError(groups.joinGroup(OUTSIDER, PRIVATE));
    assert.equal(err.httpStatus, 403);
    assert.equal(err.code, "request_required");
  });

  test("the database's named failures map to specific statuses and codes", async () => {
    const cases: [string, number, string][] = [
      ["group_not_found", 404, "group_not_found"],
      ["banned", 403, "banned"],
      ["invite_required", 403, "request_required"],
      ["invite_invalid", 404, "invite_invalid"],
      ["invite_revoked", 410, "invite_revoked"],
      ["invite_expired", 410, "invite_expired"],
      ["invite_exhausted", 410, "invite_exhausted"],
    ];
    for (const [message, status, code] of cases) {
      fake.rpcs.join_group = () => ({ data: null, error: { message } });
      const err = await serviceError(groups.joinGroup(OUTSIDER, PUBLIC));
      assert.deepEqual([err.httpStatus, err.code], [status, code], message);
    }
  });

  test("an unrecognised database error is a real failure, not a friendly message", async () => {
    fake.rpcs.join_group = () => ({ data: null, error: { message: "some unexpected explosion" } });
    const err = await rejection(groups.joinGroup(OUTSIDER, PUBLIC));
    assert.ok(!(err instanceof ServiceError));
  });

  test("an unknown community is a 404 before any database function runs", async () => {
    const err = await serviceError(groups.joinGroup(OUTSIDER, newId()));
    assert.deepEqual([err.httpStatus, err.code], [404, "group_not_found"]);
    assert.equal(fake.rpcCalls.length, 0);
  });

  test("a valid token redeems the INVITATION'S id (from the signed token) for this community, never plain join_group", async () => {
    const inviteId = newId();
    fake.rpcs.redeem_group_invite = () => ({ data: { joined: true, alreadyMember: false }, error: null });
    await groups.joinGroup(OUTSIDER, PRIVATE, tokenFor(PRIVATE, inviteId));
    assert.deepEqual(fake.rpcCalls.map((c) => c.fn), ["redeem_group_invite"]);
    assert.deepEqual(fake.rpcCalls[0].args, { p_group_id: PRIVATE, p_invite_id: inviteId, p_user_id: OUTSIDER });
  });

  test("a token issued for a different community, a forged token, and garbage are all refused without touching the database", async () => {
    for (const bad of [tokenFor(OTHER_PRIVATE), `${tokenFor(PRIVATE).slice(0, -3)}AAA`, "v1.not.a.token", "hello"]) {
      const err = await serviceError(groups.joinGroup(OUTSIDER, PRIVATE, bad));
      assert.deepEqual([err.httpStatus, err.code], [404, "invite_invalid"], bad.slice(0, 24));
    }
    assert.equal(fake.rpcCalls.length, 0);
  });

  test("an expired token is refused up front (410) without touching the database", async () => {
    const err = await serviceError(groups.joinGroup(OUTSIDER, PRIVATE, tokenFor(PRIVATE, newId(), new Date(Date.now() - 1000))));
    assert.deepEqual([err.httpStatus, err.code], [410, "invite_expired"]);
    assert.equal(fake.rpcCalls.length, 0);
  });
});

describe("creating and listing invitations", () => {
  test("only members with the community's invite permission can create one (default: moderators and up)", async () => {
    assert.equal((await serviceError(groups.createGroupInvite(PRIVATE, MEMBER))).httpStatus, 403);
    assert.equal((await serviceError(groups.createGroupInvite(PRIVATE, OUTSIDER))).httpStatus, 403, "a non-member is refused");
    await groups.createGroupInvite(PRIVATE, MOD);
    await groups.createGroupInvite(PRIVATE, ADMIN);
    assert.equal(fake.rows("group_invites").length, 2);
  });

  test("a community can open invitations up to all members", async () => {
    fake.rows("groups").find((g) => g.id === PRIVATE)!.permissions = { invite: "members" };
    await groups.createGroupInvite(PRIVATE, MEMBER);
    assert.equal(fake.rows("group_invites").length, 1);
  });

  test("defaults to 7 days and 10 uses, and the signed token's expiry equals the stored one exactly", async () => {
    const before = Date.now();
    const created = await groups.createGroupInvite(PRIVATE, ADMIN);
    assert.equal(created.maxUses, 10);
    const row = fake.rows("group_invites")[0];
    assert.equal(row.max_uses, 10);
    assert.equal(row.group_id, PRIVATE);
    assert.equal(row.created_by, ADMIN);
    const days = (new Date(String(row.expires_at)).getTime() - before) / 86_400_000;
    assert.ok(days > 6.99 && days < 7.01, `expires in ${days} days`);
    const check = verifyInviteToken(created.token, PRIVATE);
    assert.ok(check.ok);
    assert.equal(check.ok && check.inviteId, created.id);
    assert.equal(check.ok && check.expiresAt.toISOString(), row.expires_at, "token expiry and row expiry agree to the second");
  });

  test("out-of-range and non-numeric options are clamped, not trusted", async () => {
    const cases: [{ expiresInDays?: unknown; maxUses?: unknown }, number, number][] = [
      [{ expiresInDays: 9999, maxUses: 100_000 }, 30, 100],
      [{ expiresInDays: 0, maxUses: 0 }, 1, 1],
      [{ expiresInDays: -5, maxUses: -5 }, 1, 1],
      [{ expiresInDays: Number.NaN, maxUses: "many" }, 7, 10],
      [{ expiresInDays: 2.9, maxUses: 3.9 }, 2, 3],
    ];
    for (const [opts, days, uses] of cases) {
      fake.tables.group_invites = [];
      const created = await groups.createGroupInvite(PRIVATE, ADMIN, opts as { expiresInDays?: number; maxUses?: number });
      const row = fake.rows("group_invites")[0];
      assert.equal(created.maxUses, uses, JSON.stringify(opts));
      assert.ok(Math.abs((new Date(String(row.expires_at)).getTime() - Date.now()) / 86_400_000 - days) < 0.01, JSON.stringify(opts));
    }
  });

  test("a community with too many live invitations refuses more", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const longAgo = new Date(Date.now() - 2 * 86_400_000).toISOString(); // outside the per-user hourly window
    for (let i = 0; i < 200; i++) fake.seed("group_invites", { group_id: PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 1, created_at: longAgo });
    const err = await serviceError(groups.createGroupInvite(PRIVATE, ADMIN));
    assert.deepEqual([err.httpStatus, err.code], [409, "invite_limit"]);
    // Expired and cancelled invitations don't count against the limit.
    fake.tables.group_invites = fake.rows("group_invites").map((r) => ({ ...r, revoked_at: new Date().toISOString() }));
    await groups.createGroupInvite(PRIVATE, ADMIN);
  });

  test("listing shows only live invitations, each with a token that verifies for THIS community", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const live = newId();
    fake.seed(
      "group_invites",
      { id: live, group_id: PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 5, use_count: 2 },
      { group_id: PRIVATE, created_by: ADMIN, expires_at: past, max_uses: 5 },
      { group_id: PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 5, revoked_at: past },
      { group_id: PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 2, use_count: 2 },
      { group_id: OTHER_PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 5 },
    );
    const list = await groups.listGroupInvites(PRIVATE, ADMIN); // the creator
    assert.deepEqual(list.map((i) => i.id), [live]);
    assert.equal(list[0].creatorName, "Ada Admin");
    assert.equal(list[0].useCount, 2);
    const check = verifyInviteToken(list[0].token!, PRIVATE);
    assert.ok(check.ok && check.inviteId === live);
    assert.ok(!verifyInviteToken(list[0].token!, OTHER_PRIVATE).ok, "not usable on another community");
    assert.equal((await serviceError(groups.listGroupInvites(PRIVATE, MEMBER))).httpStatus, 403);
  });

  test("TOKEN EXPOSURE: another member with invite rights sees the invitation but not its working token", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const emailed = newId();
    fake.seed("group_invites", { id: emailed, group_id: PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 1 }); // e.g. a per-recipient email invite
    const asModerator = await groups.listGroupInvites(PRIVATE, MOD);
    assert.deepEqual(asModerator.map((i) => [i.id, i.token]), [[emailed, null]]);
    assert.equal(asModerator[0].creatorName, "Ada Admin", "still listed, so it can be reviewed and cancelled");
    const asCreator = await groups.listGroupInvites(PRIVATE, ADMIN);
    assert.ok(asCreator[0].token && verifyInviteToken(asCreator[0].token, PRIVATE).ok);
  });

  test("RATE LIMIT: a user can create at most 50 invitations per hour, across communities", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const recent = new Date(Date.now() - 10 * 60_000).toISOString();
    for (let i = 0; i < 50; i++) fake.seed("group_invites", { group_id: OTHER_PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 1, created_at: recent });
    const err = await serviceError(groups.createGroupInvite(PRIVATE, ADMIN));
    assert.deepEqual([err.httpStatus, err.code], [429, "invite_rate_limited"]);
    // Other users are unaffected, and invitations older than an hour don't count.
    await groups.createGroupInvite(PRIVATE, MOD);
    fake.tables.group_invites = fake.rows("group_invites").map((r) => (r.created_by === ADMIN ? { ...r, created_at: new Date(Date.now() - 2 * 3_600_000).toISOString() } : r));
    await groups.createGroupInvite(PRIVATE, ADMIN);
  });
});

describe("cancelling and inspecting invitations", () => {
  const future = () => new Date(Date.now() + 86_400_000).toISOString();

  test("staff can cancel any invitation; a member only their own; nobody else's or another community's", async () => {
    fake.rows("groups").find((g) => g.id === PRIVATE)!.permissions = { invite: "members" };
    const byAdmin = newId();
    const byMember = newId();
    const inOther = newId();
    fake.seed(
      "group_invites",
      { id: byAdmin, group_id: PRIVATE, created_by: ADMIN, expires_at: future(), max_uses: 5 },
      { id: byMember, group_id: PRIVATE, created_by: MEMBER, expires_at: future(), max_uses: 5 },
      { id: inOther, group_id: OTHER_PRIVATE, created_by: ADMIN, expires_at: future(), max_uses: 5 },
    );
    assert.equal((await serviceError(groups.revokeGroupInvite(PRIVATE, MEMBER, byAdmin))).httpStatus, 403);
    assert.equal((await serviceError(groups.revokeGroupInvite(PRIVATE, ADMIN, inOther))).httpStatus, 404, "an invitation of another community is not found here");
    assert.equal((await serviceError(groups.revokeGroupInvite(PRIVATE, OUTSIDER, byAdmin))).httpStatus, 403);
    assert.equal((await serviceError(groups.revokeGroupInvite(PRIVATE, ADMIN, newId()))).httpStatus, 404);

    await groups.revokeGroupInvite(PRIVATE, MEMBER, byMember);
    await groups.revokeGroupInvite(PRIVATE, MOD, byAdmin);
    const state = (id: string) => fake.rows("group_invites").find((r) => r.id === id)!.revoked_at;
    assert.ok(state(byMember) && state(byAdmin));
    assert.equal(state(inOther), null);
    await groups.revokeGroupInvite(PRIVATE, MOD, byAdmin); // idempotent
  });

  test("inspectInvite reports what a token would do right now, without using it", async () => {
    const id = newId();
    const expiresAt = new Date(Date.now() + 86_400_000);
    fake.seed("group_invites", { id, group_id: PRIVATE, created_by: ADMIN, expires_at: expiresAt.toISOString(), max_uses: 2 });
    const token = signInviteToken({ inviteId: id, groupId: PRIVATE, expiresAt });
    const row = () => fake.rows("group_invites").find((r) => r.id === id)!;

    assert.equal(await groups.inspectInvite(PRIVATE, token), "valid");
    row().use_count = 2;
    assert.equal(await groups.inspectInvite(PRIVATE, token), "exhausted");
    row().use_count = 0;
    row().revoked_at = new Date().toISOString();
    assert.equal(await groups.inspectInvite(PRIVATE, token), "revoked");
    row().revoked_at = null;
    row().expires_at = new Date(Date.now() - 1000).toISOString();
    assert.equal(await groups.inspectInvite(PRIVATE, token), "expired", "the database row is the authority, not just the token");

    assert.equal(await groups.inspectInvite(OTHER_PRIVATE, token), "invalid");
    assert.equal(await groups.inspectInvite(PRIVATE, "garbage"), "invalid");
    assert.equal(await groups.inspectInvite(PRIVATE, signInviteToken({ inviteId: newId(), groupId: PRIVATE, expiresAt })), "invalid", "a genuine-looking token for an invitation that doesn't exist");
    assert.equal(await groups.inspectInvite(PRIVATE, null), null);
    assert.equal(fake.rows("group_invites").find((r) => r.id === id)!.use_count, 0, "inspecting never consumes a use");
  });
});

describe("bans and removal", () => {
  test("only an admin can remove or ban; a moderator cannot", async () => {
    assert.equal((await serviceError(groups.removeMember(PRIVATE, MOD, MEMBER, { ban: true }))).httpStatus, 403);
    assert.equal((await serviceError(groups.removeMember(PRIVATE, MEMBER, MOD))).httpStatus, 403);
    assert.ok(fake.rows("group_members").some((m) => m.group_id === PRIVATE && m.user_id === MEMBER), "nobody was removed");
  });

  test("removing with ban records the ban and removes the membership; without ban, no ban", async () => {
    await groups.removeMember(PRIVATE, ADMIN, MEMBER);
    assert.equal(fake.rows("group_bans").length, 0);
    await groups.removeMember(PRIVATE, ADMIN, MOD, { ban: true, reason: "  spam  " });
    assert.deepEqual(fake.rows("group_bans").map((b) => [b.group_id, b.user_id, b.banned_by, b.reason]), [[PRIVATE, MOD, ADMIN, "spam"]]);
    assert.ok(!fake.rows("group_members").some((m) => m.group_id === PRIVATE && m.user_id === MOD));
  });

  test("banning someone who already left still records the ban", async () => {
    await groups.removeMember(PRIVATE, ADMIN, OUTSIDER, { ban: true });
    assert.equal(fake.rows("group_bans").length, 1);
  });

  test("the last admin cannot be removed or banned, and no ban is recorded when it is refused", async () => {
    fake.tables.group_members = fake.rows("group_members").filter((m) => !(m.group_id === PRIVATE && m.user_id !== ADMIN));
    fake.seed("group_members", { group_id: PRIVATE, user_id: VICTIM, role: "admin" });
    await groups.removeMember(PRIVATE, ADMIN, VICTIM, { ban: true }); // two admins: fine
    const err = await serviceError(groups.removeMember(PRIVATE, ADMIN, ADMIN));
    assert.equal(err.httpStatus, 400);
    assert.ok(fake.rows("group_members").some((m) => m.group_id === PRIVATE && m.user_id === ADMIN));
  });

  test("you cannot ban yourself", async () => {
    const err = await serviceError(groups.removeMember(PRIVATE, ADMIN, ADMIN, { ban: true }));
    assert.equal(err.httpStatus, 400);
    assert.equal(fake.rows("group_bans").length, 0);
  });

  test("bans are listed and lifted by admins only", async () => {
    fake.seed("group_bans", { group_id: PRIVATE, user_id: VICTIM, banned_by: ADMIN, reason: "x", created_at: new Date().toISOString() });
    assert.deepEqual((await groups.listBans(PRIVATE, ADMIN)).map((b) => b.userId), [VICTIM]);
    assert.equal((await serviceError(groups.listBans(PRIVATE, MOD))).httpStatus, 403);
    assert.equal((await serviceError(groups.unbanMember(PRIVATE, MOD, VICTIM))).httpStatus, 403);
    await groups.unbanMember(PRIVATE, ADMIN, VICTIM);
    assert.equal(fake.rows("group_bans").length, 0);
  });
});

describe("join requests", () => {
  test("a banned user cannot ask to join", async () => {
    fake.seed("group_bans", { group_id: PRIVATE, user_id: VICTIM });
    const err = await serviceError(groups.requestToJoin(PRIVATE, VICTIM, "please"));
    assert.deepEqual([err.httpStatus, err.code], [403, "banned"]);
    assert.equal(fake.rows("group_join_requests").length, 0);
  });

  test("a public community, an existing member, and an ordinary request behave as before", async () => {
    assert.equal((await serviceError(groups.requestToJoin(PUBLIC, OUTSIDER))).httpStatus, 400);
    assert.equal((await serviceError(groups.requestToJoin(PRIVATE, MEMBER))).httpStatus, 400);
    assert.deepEqual(await groups.requestToJoin(PRIVATE, OUTSIDER, "  hi  "), { status: "pending" });
    assert.deepEqual(fake.rows("group_join_requests").map((r) => [r.user_id, r.message, r.status]), [[OUTSIDER, "hi", "pending"]]);
  });

  test("only staff can decide; only a PENDING request can be decided", async () => {
    fake.seed("group_join_requests", { group_id: PRIVATE, user_id: OUTSIDER, status: "pending" }, { group_id: PRIVATE, user_id: VICTIM, status: "rejected" });
    assert.equal((await serviceError(groups.decideJoinRequest(PRIVATE, MEMBER, OUTSIDER, "approve"))).httpStatus, 403);
    const already = await serviceError(groups.decideJoinRequest(PRIVATE, ADMIN, VICTIM, "approve"));
    assert.equal(already.httpStatus, 409);
    assert.ok(!fake.rows("group_members").some((m) => m.user_id === VICTIM), "a rejected request is not silently reopened by approving it");
    await groups.decideJoinRequest(PRIVATE, MOD, OUTSIDER, "approve");
    assert.ok(fake.rows("group_members").some((m) => m.group_id === PRIVATE && m.user_id === OUTSIDER && m.role === "member"));
    assert.equal(fake.rows("group_join_requests").find((r) => r.user_id === OUTSIDER)!.status, "approved");
  });

  test("approving a banned user's request is refused and adds no membership", async () => {
    fake.seed("group_join_requests", { group_id: PRIVATE, user_id: VICTIM, status: "pending" });
    fake.seed("group_bans", { group_id: PRIVATE, user_id: VICTIM });
    const err = await serviceError(groups.decideJoinRequest(PRIVATE, ADMIN, VICTIM, "approve"));
    assert.deepEqual([err.httpStatus, err.code], [409, "banned"]);
    assert.ok(!fake.rows("group_members").some((m) => m.user_id === VICTIM));
    await groups.decideJoinRequest(PRIVATE, ADMIN, VICTIM, "reject"); // rejecting is still fine
  });
});

describe("invitation emails", () => {
  const linkIn = (mail: Mail) => mail.text.match(/Join here: (\S+)/)![1];

  test("a private community gets a distinct, single-use, 7-day signed invitation per recipient", async () => {
    const res = await groups.inviteByEmail(PRIVATE, ADMIN, ["a@test.invalid", "B@test.invalid", "a@test.invalid"], "https://preview.example");
    assert.equal(res.sent, 2, "deduplicated and lower-cased");
    assert.deepEqual(sent.map((m) => m.to).sort(), ["a@test.invalid", "b@test.invalid"]);

    const rows = fake.rows("group_invites");
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.max_uses, 1);
      assert.equal(row.group_id, PRIVATE);
      const days = (new Date(String(row.expires_at)).getTime() - Date.now()) / 86_400_000;
      assert.ok(days > 6.99 && days < 7.01);
    }
    const tokens = sent.map((m) => new URL(linkIn(m)).searchParams.get("invite")!);
    assert.equal(new Set(tokens).size, 2, "each recipient gets their own token");
    for (const token of tokens) {
      const check = verifyInviteToken(token, PRIVATE);
      assert.ok(check.ok && rows.some((r) => r.id === check.inviteId));
    }
    assert.ok(sent.every((m) => linkIn(m).startsWith(`https://preview.example/groups/${PRIVATE}?invite=`)));
  });

  test("a public community gets its plain link and creates no invitation rows", async () => {
    await groups.inviteByEmail(PUBLIC, ADMIN, ["a@test.invalid"], "https://preview.example");
    assert.equal(linkIn(sent[0]), `https://preview.example/groups/${PUBLIC}`);
    assert.equal(fake.rows("group_invites").length, 0);
  });

  test("APP_BASE_URL wins over the request's own origin (a spoofable Host header)", async () => {
    process.env.APP_BASE_URL = "https://apexf1hub.com";
    await groups.inviteByEmail(PRIVATE, ADMIN, ["a@test.invalid"], "https://attacker.example");
    assert.ok(linkIn(sent[0]).startsWith(`https://apexf1hub.com/groups/${PRIVATE}?invite=`));
  });

  test("user-controlled names are escaped in the HTML and cannot inject subject headers", async () => {
    fake.rows("groups").find((g) => g.id === PRIVATE)!.name = `<a href="https://evil.example">Claim prize</a>\r\nBcc: victim@test.invalid`;
    fake.rows("profiles").find((p) => p.id === ADMIN)!.display_name = `<img src=x onerror=alert(1)>`;
    await groups.inviteByEmail(PRIVATE, ADMIN, ["a@test.invalid"], "https://preview.example");
    const mail = sent[0];
    assert.doesNotMatch(mail.html, /<a href="https:\/\/evil|<img /);
    assert.match(mail.html, /&lt;a href=&quot;https:\/\/evil\.example&quot;&gt;/);
    assert.doesNotMatch(mail.subject, /[\r\n]/);
  });

  test("without invite rights nothing is created or sent", async () => {
    assert.equal((await serviceError(groups.inviteByEmail(PRIVATE, MEMBER, ["a@test.invalid"], "https://x.example"))).httpStatus, 403);
    assert.equal((await serviceError(groups.inviteByEmail(PRIVATE, OUTSIDER, ["a@test.invalid"], "https://x.example"))).httpStatus, 403);
    assert.equal(sent.length, 0);
    assert.equal(fake.rows("group_invites").length, 0);
  });

  test("validation: no addresses, an invalid address, or too many", async () => {
    assert.equal((await serviceError(groups.inviteByEmail(PRIVATE, ADMIN, [], "https://x.example"))).httpStatus, 400);
    assert.equal((await serviceError(groups.inviteByEmail(PRIVATE, ADMIN, ["not-an-email"], "https://x.example"))).httpStatus, 400);
    const tooMany = Array.from({ length: 11 }, (_, i) => `u${i}@test.invalid`);
    assert.equal((await serviceError(groups.inviteByEmail(PRIVATE, ADMIN, tooMany, "https://x.example"))).httpStatus, 400);
    assert.equal(sent.length, 0);
  });

  test("email invitations count against the per-user hourly limit; nothing is sent over it", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    for (let i = 0; i < 49; i++) fake.seed("group_invites", { group_id: PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 1, created_at: new Date().toISOString() });
    const err = await serviceError(groups.inviteByEmail(PRIVATE, ADMIN, ["a@test.invalid", "b@test.invalid"], "https://x.example"));
    assert.deepEqual([err.httpStatus, err.code], [429, "invite_rate_limited"]);
    assert.equal(sent.length, 0);
  });

  test("when the community is at its invitation limit, nothing is sent", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const longAgo = new Date(Date.now() - 2 * 86_400_000).toISOString(); // outside the per-user hourly window
    for (let i = 0; i < 199; i++) fake.seed("group_invites", { group_id: PRIVATE, created_by: ADMIN, expires_at: future, max_uses: 1, created_at: longAgo });
    const err = await serviceError(groups.inviteByEmail(PRIVATE, ADMIN, ["a@test.invalid", "b@test.invalid"], "https://x.example"));
    assert.deepEqual([err.httpStatus, err.code], [409, "invite_limit"]);
    assert.equal(sent.length, 0);
  });
});
