import { test } from "node:test";
import assert from "node:assert/strict";
import { navSectionFor } from "../navSections";

test("each page maps to its nav section", () => {
  const cases: [string, ReturnType<typeof navSectionFor>][] = [
    ["/season", "season"],
    ["/season/2026", "season"],
    ["/season/2026/bahrain-grand-prix", "season"],
    ["/archive/drivers/hamilton", "archive"],
    ["/race", "season"],
    ["/race/2026/bahrain-grand-prix", "season"],
    ["/races/simulation", "season"],
    ["/circuits", "circuits"],
    ["/circuits/monza", "circuits"],
    ["/archive", "archive"],
    ["/groups", "communities"],
    ["/groups/abc-123", "communities"],
    ["/communities", "communities"],
    ["/users", "users"],
    ["/models", "models"],
  ];
  for (const [path, section] of cases) assert.equal(navSectionFor(path), section, path);
});

test("pages outside every section, and look-alike paths, have none", () => {
  for (const path of ["/", "/profile", "/profile/notifications", "/racecar", "/seasons", "/groupsx", "", null, undefined]) {
    assert.equal(navSectionFor(path), null, String(path));
  }
});
