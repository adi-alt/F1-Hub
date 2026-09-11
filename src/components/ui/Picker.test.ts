import { test } from "node:test";
import assert from "node:assert/strict";
import { firstEnabledIndex, nextEnabledIndex } from "./Picker";

const list = (...disabled: boolean[]) => disabled.map((d) => ({ disabled: d }));

test("firstEnabledIndex finds the first selectable row", () => {
  assert.equal(firstEnabledIndex(list(false, false, false)), 0);
  assert.equal(firstEnabledIndex(list(true, true, false)), 2);
});

test("firstEnabledIndex falls back to 0 when everything is disabled", () => {
  // Not -1: the caller indexes `visible[activeIndex]`, and -1 would silently read undefined.
  assert.equal(firstEnabledIndex(list(true, true)), 0);
  assert.equal(firstEnabledIndex([]), 0);
});

test("nextEnabledIndex steps forward and backward", () => {
  const options = list(false, false, false);
  assert.equal(nextEnabledIndex(options, 0, 1), 1);
  assert.equal(nextEnabledIndex(options, 1, -1), 0);
});

test("nextEnabledIndex wraps at both ends", () => {
  const options = list(false, false, false);
  assert.equal(nextEnabledIndex(options, 2, 1), 0);
  assert.equal(nextEnabledIndex(options, 0, -1), 2);
});

test("nextEnabledIndex skips disabled rows in both directions", () => {
  const options = list(false, true, true, false);
  assert.equal(nextEnabledIndex(options, 0, 1), 3);
  assert.equal(nextEnabledIndex(options, 3, -1), 0);
});

test("nextEnabledIndex cannot spin forever when every row is disabled", () => {
  // The trap case: without the bounded loop this walks the ring endlessly and hangs the tab.
  assert.equal(nextEnabledIndex(list(true, true, true), 1, 1), 1);
  assert.equal(nextEnabledIndex([], 0, 1), 0);
});

test("nextEnabledIndex handles a single enabled row by staying put", () => {
  assert.equal(nextEnabledIndex(list(false), 0, 1), 0);
  assert.equal(nextEnabledIndex(list(true, false, true), 1, 1), 1);
});
