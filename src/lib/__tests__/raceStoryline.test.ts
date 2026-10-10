import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStoryline, type LapEntry } from "../raceMoments";

const lap = (n: number, order: string[]): LapEntry => ({ lap: n, timings: order.map((d, i) => ({ driverId: d, time: null, position: i + 1 })) });
const name = (id: string) => id;

test("tells the start, each lead change with how long the last leader held it, the biggest charge and the flag", () => {
  const laps = [lap(1, ["A", "B", "C", "D"]), lap(2, ["A", "B", "C", "D"]), lap(3, ["B", "A", "C", "D"]), lap(4, ["B", "D", "A", "C"]), lap(5, ["B", "D", "A", "C"])];
  const story = computeStoryline(laps, name);
  assert.deepEqual(story.map((c) => [c.lap, c.kind, c.driverId]), [[1, "start", "A"], [3, "lead", "B"], [4, "charge", "D"], [5, "finish", "B"]]);
  assert.match(story[1].story, /A had led for 2 laps since lap 1/);
  assert.match(story[2].story, /2 places in a single lap, from P4 to P2/);
  assert.match(story[3].story, /B led 3 laps in all, the last 3 laps without a break/);
});

test("a lights-to-flag win says so, and a one-place move is not a charge", () => {
  const story = computeStoryline([lap(1, ["A", "B"]), lap(2, ["A", "B"]), lap(3, ["A", "B"])], name);
  assert.deepEqual(story.map((c) => c.kind), ["start", "finish"]);
  assert.match(story[1].story, /led 3 laps in all, every one of them/);
});

test("no positions, no story", () => {
  assert.deepEqual(computeStoryline([{ lap: 1, timings: [{ driverId: "A", time: null, position: null }] }], name), []);
});

test("a race with many lead changes is capped at eight chapters, keeping the start and the flag", () => {
  const laps = Array.from({ length: 20 }, (_, i) => lap(i + 1, i % 2 ? ["B", "A"] : ["A", "B"]));
  const story = computeStoryline(laps, name);
  assert.equal(story.length, 8);
  assert.equal(story[0].kind, "start");
  assert.equal(story.at(-1)!.kind, "finish");
});
