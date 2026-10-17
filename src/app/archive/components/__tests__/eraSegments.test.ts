import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEraSegments } from "../eraSegments";

describe("buildEraSegments", () => {
  it("collapses every race of a stint into one segment, not one per race", () => {
    const races = (year: number, label: string, n: number) => Array.from({ length: n }, () => ({ year, label, raceCount: 1 }));
    const segments = buildEraSegments([...races(2007, "McLaren", 17), ...races(2008, "McLaren", 18), ...races(2013, "Mercedes", 19), ...races(2014, "Mercedes", 19), ...races(2025, "Ferrari", 24)]);
    assert.deepEqual(segments, [
      { from: 2007, to: 2008, label: "McLaren", raceCount: 35 },
      { from: 2013, to: 2014, label: "Mercedes", raceCount: 38 },
      { from: 2025, to: 2025, label: "Ferrari", raceCount: 24 },
    ]);
  });
});
