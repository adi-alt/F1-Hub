import { test } from "node:test";
import assert from "node:assert/strict";
import { driverOutlook, outlookHeadline } from "./ModelOutlook";
import type { SimulatedDriverEntry } from "@/lib/types/race";

const flat = (lead: number) => Array.from({ length: 20 }, (_, i) => (i === 0 ? lead : (1 - lead) / 19));
const entry = (driver: string, p1: number, podium: number, pp: number[]): SimulatedDriverEntry => ({
  driver,
  team: "Mercedes",
  medianPosition: 5,
  positionProbabilities: pp,
  p1,
  podium,
  top5: 0.56,
});

test("a nearly flat race is called open, not a favourite on 6%", () => {
  const drivers = [entry("ANT", 0.065, 0.64, [0.11, 0.12, 0.12, 0.08, 0.08, ...Array(15).fill(0.0327)]), entry("PIA", 0.06, 0.36, flat(0.05))];
  const line = outlookHeadline(drivers, (c) => c)!;
  assert.match(line, /open race/);
  assert.doesNotMatch(line, /favourite/);
});

test("a clear leader is the favourite", () => {
  const line = outlookHeadline([entry("NOR", 0.44, 0.8, flat(0.44)), entry("PIA", 0.2, 0.5, flat(0.2))], (c) => c)!;
  assert.match(line, /^NOR is the favourite: 44% to win/);
});

test("podium, top 5 and likely finish come from one distribution and agree", () => {
  const o = driverOutlook(entry("ANT", 0.065, 0.64, [0.11, 0.12, 0.12, 0.08, 0.08, ...Array(15).fill(0.0327)]));
  assert.equal(Math.round(o.podium * 100), 35);
  assert.ok(o.top5 >= o.podium);
  assert.equal(o.likely, 5);
});
