import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractInviteToken } from "../inviteLink";
import { signInviteToken, verifyInviteToken } from "../inviteTokens";

const SECRET = "test-secret-not-a-real-one-0123456789";
const GROUP = "11111111-2222-4333-8444-555555555555";
const OTHER_GROUP = "11111111-2222-4333-8444-666666666666";
const INVITE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EXPIRES = new Date("2026-12-01T00:00:00Z");
const token = () => signInviteToken({ inviteId: INVITE, groupId: GROUP, expiresAt: EXPIRES }, SECRET);

describe("signed invite tokens", () => {
  test("a valid token round-trips to its invite id and expiry", () => {
    const res = verifyInviteToken(token(), GROUP, EXPIRES.getTime() - 1000, SECRET);
    assert.ok(res.ok);
    assert.equal(res.ok && res.inviteId, INVITE);
    assert.equal(res.ok && res.expiresAt.getTime(), EXPIRES.getTime());
  });

  test("expiry boundary: valid until the instant, rejected at and after", () => {
    assert.ok(verifyInviteToken(token(), GROUP, EXPIRES.getTime() - 1, SECRET).ok);
    for (const now of [EXPIRES.getTime(), EXPIRES.getTime() + 1]) assert.deepEqual(verifyInviteToken(token(), GROUP, now, SECRET), { ok: false, reason: "expired" });
  });

  test("a token for one community is rejected on another", () => {
    assert.deepEqual(verifyInviteToken(token(), OTHER_GROUP, 0, SECRET), { ok: false, reason: "bad_signature" });
  });

  test("tampering with the invite id, the expiry, or the signature is rejected", () => {
    const [v, id, exp, sig] = token().split(".");
    const otherId = "b".repeat(32);
    assert.equal(verifyInviteToken([v, otherId, exp, sig].join("."), GROUP, 0, SECRET).ok, false);
    assert.equal(verifyInviteToken([v, id, String(Number(exp) + 86_400 * 365), sig].join("."), GROUP, 0, SECRET).ok, false);
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    assert.equal(verifyInviteToken([v, id, exp, flipped].join("."), GROUP, 0, SECRET).ok, false);
  });

  test("a token signed with a different secret is rejected", () => {
    const forged = signInviteToken({ inviteId: INVITE, groupId: GROUP, expiresAt: EXPIRES }, "some-other-secret-entirely-9876543210");
    assert.deepEqual(verifyInviteToken(forged, GROUP, 0, SECRET), { ok: false, reason: "bad_signature" });
  });

  test("garbage input is malformed, never a crash", () => {
    for (const bad of [undefined, null, 42, "", "abc", "v2.x.y.z", "v1.zz.1.sig", `v1.${"a".repeat(32)}.notnum.${"A".repeat(22)}`, "v1." + "a".repeat(300), {}]) {
      assert.deepEqual(verifyInviteToken(bad, GROUP, 0, SECRET), { ok: false, reason: "malformed" }, String(bad).slice(0, 30));
    }
  });

  test("the group's own uuid alone is not a token", () => {
    assert.equal(verifyInviteToken(GROUP, GROUP, 0, SECRET).ok, false);
  });

  test("extractInviteToken finds a token in a pasted link, a query string, or bare", () => {
    const t = token();
    assert.equal(extractInviteToken(`https://apexf1hub.com/groups/${GROUP}?invite=${t}`), t);
    assert.equal(extractInviteToken(`  ?tab=feed&invite=${t}  `), t);
    assert.equal(extractInviteToken(t), t);
    assert.equal(extractInviteToken(`https://apexf1hub.com/groups/${GROUP}`), null);
    assert.equal(extractInviteToken(GROUP), null);
  });

  test("signing requires a secret to be configured", () => {
    const saved = { a: process.env.INVITE_TOKEN_SECRET, b: process.env.SESSION_SECRET };
    delete process.env.INVITE_TOKEN_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      assert.throws(() => signInviteToken({ inviteId: INVITE, groupId: GROUP, expiresAt: EXPIRES }), /must be set/);
    } finally {
      if (saved.a !== undefined) process.env.INVITE_TOKEN_SECRET = saved.a;
      if (saved.b !== undefined) process.env.SESSION_SECRET = saved.b;
    }
  });
});
