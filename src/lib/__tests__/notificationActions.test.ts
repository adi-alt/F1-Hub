import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationActions } from "@/lib/notificationKinds";

const G = "11111111-1111-1111-1111-111111111111";

test("a pending post offers approve and decline through the moderation route", () => {
  const [approve, decline] = notificationActions({ kind: "post_pending", groupId: G, href: `/?section=communities&group=${G}&post=p1`, actor: { id: "a" } });
  assert.deepEqual(approve.request, { url: `/api/groups/${G}/posts/p1/moderate`, body: { action: "approve" } });
  assert.deepEqual(decline.request?.body, { action: "reject" });
});

test("a join request is decided for the person who asked", () => {
  const [approve] = notificationActions({ kind: "join_request", groupId: G, href: null, actor: { id: "u2" } });
  assert.equal(approve.request?.url, `/api/groups/${G}/join-requests/u2`);
});

test("an invitation accepts with its token, and declining calls nothing", () => {
  const [accept, decline] = notificationActions({ kind: "invite", groupId: G, href: `/?group=${G}&invite=tok`, actor: null });
  assert.deepEqual(accept.request, { url: `/api/groups/${G}/join`, body: { inviteToken: "tok" } });
  assert.equal(decline.request, undefined);
});

test("kinds without actions, or rows missing what an action needs, get none", () => {
  assert.deepEqual(notificationActions({ kind: "reply", groupId: G, href: "/x", actor: null }), []);
  assert.deepEqual(notificationActions({ kind: "join_request", groupId: G, href: null, actor: null }), []);
});
