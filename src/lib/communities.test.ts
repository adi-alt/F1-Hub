import { test } from "node:test";
import assert from "node:assert/strict";
import {
  communityTypeMeta,
  normalizeTags,
  normalizeTopic,
  postKindsFor,
  resolveModules,
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
