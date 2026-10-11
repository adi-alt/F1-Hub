// The championship, reconciled against the official record. The fixture is Jolpica's 2026 classifications (every
// Grand Prix and sprint, rounds 1-16) and its official standings after round 16. Our scoring code, fed those
// classifications, must reproduce the official table exactly, driver by driver: Grand Prix plus sprint points,
// each counted once. (Before sprints were counted, every driver with a sprint point was short by exactly that; the
// one other gap, Piastri's +2, was round 6's classification as amended after the race - see the PR.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeStandings } from "../standings";
import { computeChampionshipProgression } from "../championshipProgression";
import { entityResults, roundPoints, type RaceSummary } from "../../app/season/_service/season.pure";
import type { RaceDoc } from "../types/race";

type Row = { code: string; team: string; pos: number; points: number };
const F = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/jolpica_2026_r1-16_points.json"), "utf8")) as { race: Record<string, Row[]>; sprint: Record<string, Row[]>; standingsAfter16: Record<string, number> };
const entry = (x: Row) => ({ driver: x.code, driverName: x.code, team: x.team, grid: null, finishPosition: x.pos, finishGapSec: null, status: "finished" as const, points: x.points });
const races: RaceDoc[] = Object.keys(F.race).map((r) => ({
  id: `2026_r${r}`, year: 2026, round: Number(r), circuit: `r${r}`, name: `Round ${r}`, status: "completed", updatedAt: "",
  results: F.race[r].map((x) => ({ ...entry(x), fastestLapSec: null })),
  sprintResults: F.sprint[r]?.map(entry),
}));

test("our standings reproduce the official 2026 table after round 16, driver by driver", () => {
  const ours = Object.fromEntries(computeStandings(races).drivers.map((d) => [d.driver, d.points]));
  const mismatches = Object.entries(F.standingsAfter16).filter(([code, pts]) => (ours[code] ?? 0) !== pts).map(([code, pts]) => `${code}: official ${pts}, ours ${ours[code] ?? 0}`);
  assert.deepEqual(mismatches, []);
});

test("without the sprints, every driver is short by exactly their sprint points - the bug this fixes", () => {
  const gpOnly = Object.fromEntries(computeStandings(races.map((r) => ({ ...r, sprintResults: undefined }))).drivers.map((d) => [d.driver, d.points]));
  const sprintPts: Record<string, number> = {};
  for (const rows of Object.values(F.sprint)) for (const x of rows) sprintPts[x.code] = (sprintPts[x.code] ?? 0) + x.points;
  for (const [code, pts] of Object.entries(F.standingsAfter16)) assert.equal(pts - (gpOnly[code] ?? 0), sprintPts[code] ?? 0, code);
  assert.equal(Object.values(sprintPts).reduce((a, b) => a + b, 0), 5 * 36, "five sprints, 8+7+...+1 = 36 points each");
});

test("the progression's last round equals the standings (sprints counted once, in their round)", () => {
  const codes = Object.keys(F.standingsAfter16);
  const last = computeChampionshipProgression(races, codes).at(-1)!;
  const standings = Object.fromEntries(computeStandings(races).drivers.map((d) => [d.driver, d.points]));
  for (const c of codes) assert.equal(last[c], standings[c] ?? 0, c);
});

test("roundPoints and entityResults: a round's points are the Grand Prix plus the sprint, positions stay the Grand Prix's", () => {
  const summary = (r: RaceDoc): RaceSummary =>
    ({ round: r.round, trackShort: "X", state: "completed", results: r.results!.map(({ fastestLapSec: _f, finishGapSec: _g, ...x }) => x), sprintResults: r.sprintResults?.map(({ finishGapSec: _g, ...x }) => x) }) as unknown as RaceSummary;
  const summaries = races.map(summary);
  const china = summaries.find((s) => s.round === 2)!;
  const rusGp = china.results.find((x) => x.driver === "RUS")!.points;
  const rusSprint = china.sprintResults!.find((x) => x.driver === "RUS")!.points;
  assert.equal(roundPoints(china, "RUS"), rusGp + rusSprint);
  const rus = entityResults(summaries, "RUS", false);
  assert.equal(rus.reduce((s, r) => s + r.points, 0), F.standingsAfter16.RUS, "form sums add up to the championship total");
  assert.equal(rus.find((r) => r.round === 2)!.position, china.results.find((x) => x.driver === "RUS")!.finishPosition, "position is the Grand Prix's");
  const merc = roundPoints(china, "Mercedes", true);
  assert.equal(merc, [...china.results, ...china.sprintResults!].filter((x) => x.team === "Mercedes").reduce((s, x) => s + x.points, 0));
});
