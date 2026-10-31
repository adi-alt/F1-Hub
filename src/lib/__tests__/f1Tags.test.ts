import { test } from "node:test";
import assert from "node:assert/strict";
import {
  F1_DRIVER_TAGS,
  F1_SESSION_TAGS,
  F1_TEAM_TAGS,
  parseF1Tags,
  type F1Tag,
} from "../communities";

test("parseF1Tags handles null, non-array, and empty input", () => {
  assert.equal(parseF1Tags(null), null);
  assert.equal(parseF1Tags(undefined), null);
  assert.equal(parseF1Tags("invalid"), null);
  assert.equal(parseF1Tags({}), null);
  assert.equal(parseF1Tags([]), null);
});

test("parseF1Tags parses valid tag objects correctly", () => {
  const input = [
    { category: "driver", id: "VER", label: "Max Verstappen" },
    { category: "team", id: "ferrari", label: "Ferrari" },
    { category: "session", id: "RACE", label: "Race" },
  ];
  const tags = parseF1Tags(input);
  assert.ok(tags);
  assert.equal(tags.length, 3);
  assert.deepEqual(tags[0], { category: "driver", id: "ver", label: "Max Verstappen" });
  assert.deepEqual(tags[1], { category: "team", id: "ferrari", label: "Ferrari" });
  assert.deepEqual(tags[2], { category: "session", id: "race", label: "Race" });
});

test("parseF1Tags filters out invalid categories and empty ids or labels", () => {
  const input = [
    { category: "unknown_category", id: "abc", label: "Test" },
    { category: "driver", id: "", label: "Empty ID" },
    { category: "team", id: "mercedes", label: "" },
    null,
    "not-an-object",
    { category: "driver", id: "ham", label: "Lewis Hamilton" },
  ];
  const tags = parseF1Tags(input);
  assert.ok(tags);
  assert.equal(tags.length, 1);
  assert.deepEqual(tags[0], { category: "driver", id: "ham", label: "Lewis Hamilton" });
});

test("parseF1Tags caps results at maximum 5 tags", () => {
  const input: F1Tag[] = [
    { category: "driver", id: "1", label: "D1" },
    { category: "driver", id: "2", label: "D2" },
    { category: "driver", id: "3", label: "D3" },
    { category: "driver", id: "4", label: "D4" },
    { category: "driver", id: "5", label: "D5" },
    { category: "driver", id: "6", label: "D6" },
  ];
  const tags = parseF1Tags(input);
  assert.ok(tags);
  assert.equal(tags.length, 5);
});

test("catalogs for sessions, teams, and drivers are non-empty and well-formed", () => {
  assert.ok(F1_SESSION_TAGS.length >= 6);
  assert.ok(F1_TEAM_TAGS.length >= 10);
  assert.ok(F1_DRIVER_TAGS.length >= 20);

  for (const tag of [...F1_SESSION_TAGS, ...F1_TEAM_TAGS, ...F1_DRIVER_TAGS]) {
    assert.ok(tag.id.length > 0);
    assert.ok(tag.label.length > 0);
    assert.ok(["session", "team", "driver", "grand_prix", "circuit"].includes(tag.category));
  }
});
