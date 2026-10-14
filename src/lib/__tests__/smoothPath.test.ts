import { it } from "node:test";
import assert from "node:assert/strict";
import { smoothAreaPath, smoothOpenPath } from "../smoothPath";

const controls = (d: string) =>
  [...d.matchAll(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g)].map((m) => m.slice(1).map(Number));

it("passes through every point with one cubic per segment", () => {
  const d = smoothOpenPath([[0, 10], [10, 20], [20, 5]]);
  assert.match(d, /^M0,10 C/);
  const segs = controls(d);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs[0].slice(4), [10, 20]);
  assert.deepEqual(segs[1].slice(4), [20, 5]);
});

it("never overshoots: a rising series stays rising, a flat run stays flat", () => {
  // Cumulative points (screen y grows downward, so "rising" means y falling): 0, 10, 10, 25.
  const pts = [[0, 100], [10, 90], [20, 90], [30, 75]] as const;
  for (const [, y1, , y2, , y3] of controls(smoothOpenPath(pts))) {
    // Every control point stays within the data's own range.
    for (const y of [y1, y2, y3]) assert.ok(y <= 100 && y >= 75, `control y ${y} out of range`);
  }
  // The flat stretch (10 -> 10) is drawn flat: both its control points at y = 90.
  const flat = controls(smoothOpenPath(pts))[1];
  assert.equal(flat[1], 90);
  assert.equal(flat[3], 90);
});

it("closes an area down to its baseline, and handles short input", () => {
  assert.match(smoothAreaPath([[0, 5], [10, 2]], 20), / L10,20 L0,20 Z$/);
  assert.equal(smoothOpenPath([]), "");
  assert.equal(smoothOpenPath([[3, 4]]), "M3,4");
  assert.equal(smoothAreaPath([[3, 4]], 10), "");
});
