import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sparklineTrend } from "./Sparkline";

// These series are CUMULATIVE championship points, which is the whole reason the classifier works
// the way it does: the numbers never fall, so a naive "is it rising" check would return the same
// answer for every driver who has scored a single point all season.
describe("sparklineTrend", () => {
  it("calls a steady scorer flat rather than rising", () => {
    // 10 points every round. Unmistakably an upward line, and completely unremarkable.
    assert.equal(sparklineTrend([10, 20, 30, 40, 50, 60]), "flat");
  });

  it("calls a driver scoring harder than before accelerating", () => {
    // Two quiet rounds, then three big hauls.
    assert.equal(sparklineTrend([10, 12, 14, 39, 64, 89]), "up");
  });

  it("calls a driver who has tailed off declining, even though the line still rises", () => {
    // Big early hauls, then almost nothing - the line goes up throughout.
    assert.equal(sparklineTrend([10, 35, 60, 85, 87, 89]), "down");
  });

  it("treats scoring nothing across the window as flat, never as a decline", () => {
    assert.equal(sparklineTrend([42, 42, 42, 42]), "flat");
  });

  it("treats a driver who only started scoring late as accelerating", () => {
    // Still on zero at the midpoint, so the early rate is genuinely 0 and the ratio test would
    // compare against zero. This is the case the explicit guard exists for.
    assert.equal(sparklineTrend([0, 0, 0, 0, 20, 50]), "up");
    // And the ordinary path: scoring slowly, then much faster.
    assert.equal(sparklineTrend([0, 0, 0, 15, 33, 58]), "up");
  });

  it("is defined for series too short to have a shape", () => {
    assert.equal(sparklineTrend([]), "flat");
    assert.equal(sparklineTrend([25]), "flat");
  });

  it("never reports a decline for a series that genuinely never falls and never stalls", () => {
    // A perfectly linear climb must not be red; red has to mean something specific.
    for (const step of [1, 5, 12, 25]) {
      const series = [0, step, step * 2, step * 3, step * 4].map((v) => v + 7);
      assert.notEqual(sparklineTrend(series), "down", `linear +${step} should not read as a decline`);
    }
  });
});
