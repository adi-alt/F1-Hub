import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHomeSinceLastVisit } from "./homeSinceLastVisit";

const activity = [
  { key: "a", timestamp: "2026-10-20T10:00:00Z", text: "new" },
  { key: "b", timestamp: "2026-10-10T10:00:00Z", text: "old" },
];
const change = { type: "CHAMPIONSHIP" as const, title: "Leader changed", explanation: "" };

test("a returning visitor sees only what happened after their previous visit ended", () => {
  const out = buildHomeSinceLastVisit({ since: "2026-10-15T00:00:00Z", activity, changes: [change], newCommunityPosts: 3 });
  assert.deepEqual(out.activity.map((a) => a.key), ["a"]);
  assert.equal(out.newCommunityPosts, 3);
  assert.equal(out.changes.length, 1);
});

test("a first visit has nothing to diff against: recent activity, no changes, no post count", () => {
  const out = buildHomeSinceLastVisit({ since: null, activity, changes: [change], newCommunityPosts: 3 });
  assert.equal(out.since, null);
  assert.equal(out.activity.length, 2);
  assert.equal(out.changes.length, 0);
  assert.equal(out.newCommunityPosts, 0);
});
