import { test } from "node:test";
import assert from "node:assert/strict";
import { navSectionFor } from "../navSections";

test("each page maps to its nav section", () => {
  const cases: [string, ReturnType<typeof navSectionFor>][] = [
    ["/season", "season"],
    ["/season/2026/race/bahrain-grand-prix", "season"],
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

test("the public URLs map by their section, a race's page to Season", () => {
  const q = (s: string) => new URLSearchParams(s);
  assert.equal(navSectionFor("/", q("section=archive&team=ferrari")), "archive");
  assert.equal(navSectionFor("/", q("section=season&year=2026&race=bahrain-grand-prix")), "season");
  assert.equal(navSectionFor("/", q("section=communities&id=x")), "communities");
  assert.equal(navSectionFor("/", q("section=profile&tab=notifications")), null);
  assert.equal(navSectionFor("/", q("")), null);
});

test("pages outside every section, and look-alike paths, have none", () => {
  for (const path of ["/", "/profile", "/profile/edit", "/racecar", "/seasons", "/groupsx", "", null, undefined]) {
    assert.equal(navSectionFor(path), null, String(path));
  }
});
