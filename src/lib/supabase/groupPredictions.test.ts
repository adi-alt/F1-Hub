import { test } from "node:test";
import assert from "node:assert/strict";
import { describeGuess } from "./groupPredictions";

test("describeGuess resolves a single driver guess to a real name, falling back to the code", () => {
  const names = new Map([["VER", "Max Verstappen"]]);
  assert.equal(describeGuess("winner", "VER", names), "Max Verstappen");
  assert.equal(describeGuess("pole", "VER", names), "Max Verstappen");
  assert.equal(describeGuess("fastest_lap", "VER", names), "Max Verstappen");
  // A driver who's left the grid (no entry in the current-roster map) stays as the code - the
  // honest outcome, never a fabricated name.
  assert.equal(describeGuess("winner", "XXX", names), "XXX");
});

test("describeGuess joins a podium guess into one readable string, position order preserved", () => {
  const names = new Map([
    ["VER", "Max Verstappen"],
    ["HAM", "Lewis Hamilton"],
  ]);
  assert.equal(describeGuess("podium", ["VER", "HAM", "ALB"], names), "Max Verstappen, Lewis Hamilton, ALB");
});

test("describeGuess pluralizes a DNF count correctly at the boundary", () => {
  const names = new Map<string, string>();
  assert.equal(describeGuess("dnf_count", 0, names), "0 retirements");
  assert.equal(describeGuess("dnf_count", 1, names), "1 retirement");
  assert.equal(describeGuess("dnf_count", 4, names), "4 retirements");
});
