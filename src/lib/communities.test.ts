import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDo,
  communityTypeMeta,
  permissionLevel,
  normalizeTags,
  normalizeTopic,
  postKindsFor,
  resolveModules,
  sortDiscover,
  toggleableModules,
} from "./communities";

test("resolveModules returns each type's defaults when features is empty", () => {
  assert.deepEqual(resolveModules("general", {}), ["feed", "media", "members", "about"]);
  assert.deepEqual(resolveModules("f1", {}), ["feed", "predictions", "leaderboard", "media", "members", "about"]);
  assert.deepEqual(resolveModules("prediction_league", {}), ["feed", "predictions", "leaderboard", "members", "about"]);
  assert.deepEqual(resolveModules("private_circle", {}), ["feed", "media", "members", "about"]);
});

test("resolveModules honours explicit overrides in both directions", () => {
  // Off by default for a general community, switched on.
  assert.ok(resolveModules("general", { media: false }).includes("media") === false);
  // On by default for an F1 community, switched off.
  assert.ok(resolveModules("f1", { predictions: false }).includes("predictions") === false);
  // Leaving it unset keeps the default rather than reading as `false`.
  assert.ok(resolveModules("f1", { media: false }).includes("predictions"));
});

test("resolveModules never enables F1-only modules on a non-F1 community, whatever features claims", () => {
  const forced = resolveModules("general", { predictions: true, leaderboard: true });
  assert.ok(!forced.includes("predictions"));
  assert.ok(!forced.includes("leaderboard"));
  assert.deepEqual(forced, ["feed", "media", "members", "about"]);
});

test("resolveModules keeps required modules on even when explicitly disabled", () => {
  const stripped = resolveModules("general", { feed: false, members: false, about: false });
  assert.deepEqual(stripped, ["feed", "media", "members", "about"]);
});

test("resolveModules is defensive about junk from the database", () => {
  // A row written by a newer deploy, or a hand-edited jsonb, must never blank the page.
  assert.deepEqual(resolveModules("general", null), ["feed", "media", "members", "about"]);
  assert.deepEqual(resolveModules("general", "nonsense"), ["feed", "media", "members", "about"]);
  assert.deepEqual(resolveModules("general", []), ["feed", "media", "members", "about"]);
  // Unknown type falls back to General rather than throwing.
  assert.deepEqual(resolveModules("time_travel_club", {}), ["feed", "media", "members", "about"]);
  assert.equal(communityTypeMeta(undefined).value, "general");
});

test("toggleableModules never offers required or type-inapplicable modules", () => {
  assert.deepEqual(toggleableModules("general"), ["media"]);
  assert.deepEqual(toggleableModules("f1"), ["predictions", "leaderboard", "media"]);
});

test("postKindsFor stays generic off F1, and only offers Prediction when that module is on", () => {
  assert.deepEqual(postKindsFor("general", {}), ["discussion", "question"]);
  assert.deepEqual(postKindsFor("private_circle", {}), ["discussion", "question"]);
  assert.deepEqual(postKindsFor("f1", {}), ["discussion", "question", "race_discussion", "prediction"]);
  assert.deepEqual(postKindsFor("f1", { predictions: false }), ["discussion", "question", "race_discussion"]);
});

test("normalizeTopic trims, caps length, and rejects blanks", () => {
  assert.equal(normalizeTopic("  Photography  "), "Photography");
  assert.equal(normalizeTopic("   "), null);
  assert.equal(normalizeTopic(null), null);
  assert.equal(normalizeTopic(42), null);
  assert.equal(normalizeTopic("x".repeat(100))?.length, 40);
});

test("normalizeTags lowercases, de-duplicates, drops junk, and caps at five", () => {
  assert.deepEqual(normalizeTags(["Ferrari", "ferrari", " STRATEGY "]), ["ferrari", "strategy"]);
  assert.deepEqual(normalizeTags(["a", "b", "c", "d", "e", "f", "g"]), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(normalizeTags([1, null, "", "ok"]), ["ok"]);
  assert.deepEqual(normalizeTags("not-an-array"), []);
  assert.equal(normalizeTags(["x".repeat(100)])[0].length, 24);
});

// ---------------------------------------------------------------- discovery ordering

type Row = {
  name: string;
  topic: string | null;
  createdAt: string;
  memberCount: number;
  activePredictions: number;
  weeklyPosts: number;
  isMember: boolean;
};

function row(name: string, over: Partial<Row> = {}): Row {
  return {
    name,
    topic: null,
    createdAt: "2026-01-01T00:00:00Z",
    memberCount: 0,
    activePredictions: 0,
    weeklyPosts: 0,
    isMember: false,
    ...over,
  };
}

const names = (rows: Row[]) => rows.map((r) => r.name);

test("sortDiscover orders by each real key", () => {
  const rows = [
    row("small", { memberCount: 2, weeklyPosts: 9, createdAt: "2026-05-01T00:00:00Z" }),
    row("big", { memberCount: 90, weeklyPosts: 1, createdAt: "2026-02-01T00:00:00Z" }),
    row("newest", { memberCount: 10, weeklyPosts: 0, createdAt: "2026-09-01T00:00:00Z" }),
  ];
  assert.deepEqual(names(sortDiscover(rows, "members")), ["big", "newest", "small"]);
  assert.deepEqual(names(sortDiscover(rows, "new")), ["newest", "small", "big"]);
  assert.deepEqual(names(sortDiscover(rows, "trending")), ["small", "big", "newest"]);
});

test("sortDiscover 'active' counts open predictions as well as posts, 'trending' does not", () => {
  const rows = [
    row("quiet-league", { activePredictions: 5, weeklyPosts: 0 }),
    row("chatty", { activePredictions: 0, weeklyPosts: 3 }),
  ];
  assert.deepEqual(names(sortDiscover(rows, "active")), ["quiet-league", "chatty"]);
  assert.deepEqual(names(sortDiscover(rows, "trending")), ["chatty", "quiet-league"]);
});

test("sortDiscover 'recommended' sinks joined communities and favours familiar topics", () => {
  const rows = [
    row("already-in", { isMember: true, weeklyPosts: 100 }),
    row("unfamiliar", { topic: "Cricket", weeklyPosts: 5 }),
    row("familiar", { topic: "Photography", weeklyPosts: 1 }),
  ];
  const sorted = sortDiscover(rows, "recommended", new Set(["Photography"]));
  // Familiar topic beats a more active unfamiliar one; a community you already joined is last
  // however busy it is.
  assert.deepEqual(names(sorted), ["familiar", "unfamiliar", "already-in"]);
});

test("sortDiscover 'recommended' degrades to activity order with no topic history", () => {
  const rows = [row("a", { weeklyPosts: 1 }), row("b", { weeklyPosts: 7 }), row("c", { weeklyPosts: 4 })];
  assert.deepEqual(names(sortDiscover(rows, "recommended", new Set())), names(sortDiscover(rows, "active")));
});

test("sortDiscover never mutates its input", () => {
  const rows = [row("z", { memberCount: 1 }), row("a", { memberCount: 9 })];
  const before = names(rows);
  sortDiscover(rows, "members");
  assert.deepEqual(names(rows), before);
});

// ---------------------------------------------------------------- permissions

test("canDo defaults match the behaviour that predated the permissions column", () => {
  // An existing community has permissions = {}; it must behave exactly as it did before.
  assert.equal(canDo({}, "post", "member"), true);
  assert.equal(canDo({}, "comment", "member"), true);
  // Invites were moderators+ before the permissions column existed, and stay that way by default.
  assert.equal(canDo({}, "invite", "member"), false);
  assert.equal(canDo({}, "invite", "moderator"), true);
  // Prediction rounds were admin-only before, and stay admin-only by default.
  assert.equal(canDo({}, "createPredictions", "member"), false);
  assert.equal(canDo({}, "createPredictions", "moderator"), false);
  assert.equal(canDo({}, "createPredictions", "admin"), true);
});

test("canDo respects an explicit level, and higher roles always satisfy a lower bar", () => {
  const locked = { post: "moderators" as const };
  assert.equal(canDo(locked, "post", "member"), false);
  assert.equal(canDo(locked, "post", "moderator"), true);
  assert.equal(canDo(locked, "post", "admin"), true);

  const adminsOnly = { comment: "admins" as const };
  assert.equal(canDo(adminsOnly, "comment", "moderator"), false);
  assert.equal(canDo(adminsOnly, "comment", "admin"), true);
});

test("canDo refuses a non-member and tolerates junk", () => {
  assert.equal(canDo({}, "post", null), false);
  assert.equal(canDo({}, "post", undefined), false);
  assert.equal(canDo({}, "post", "spectator"), false);
  // A malformed permissions blob falls back to the defaults rather than locking everyone out.
  assert.equal(canDo("nonsense", "post", "member"), true);
  assert.equal(canDo({ post: "wizards" }, "post", "member"), true);
});

test("permissionLevel reports the effective level for the Manage UI", () => {
  assert.equal(permissionLevel({}, "post"), "members");
  assert.equal(permissionLevel({}, "createPredictions"), "admins");
  assert.equal(permissionLevel({ post: "admins" }, "post"), "admins");
});
