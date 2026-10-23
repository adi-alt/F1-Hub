// League table scoping (audit R-43): current members only, scores from the join day onwards, and a
// reconcile check that the table's totals equal exactly the eligible group_race_scores rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLeagueTable, type LeagueScore } from "../leagueTable";

const raceDates = new Map<string, string | null>([
  ["r1", "2026-03-01"],
  ["r2", "2026-04-01"],
  ["r3", "2026-05-01"],
  ["undated", null],
]);
const members = [
  { userId: "alice", joinedAt: "2026-01-10T12:00:00Z" },
  { userId: "bob", joinedAt: "2026-04-01T18:00:00Z" }, // joined race day: r2 counts
  { userId: "cara", joinedAt: "2026-04-15T00:00:00Z" },
];
const scores: LeagueScore[] = [
  { userId: "alice", raceId: "r1", score: 10 },
  { userId: "alice", raceId: "r2", score: 5 },
  { userId: "bob", raceId: "r1", score: 25 }, // before bob joined
  { userId: "bob", raceId: "r2", score: 8 },
  { userId: "bob", raceId: "r3", score: 7 },
  { userId: "cara", raceId: "r3", score: 3 },
  { userId: "cara", raceId: "undated", score: 50 },
  { userId: "gone", raceId: "r1", score: 99 }, // no longer a member
];

test("only current members, only races from their join day", () => {
  const table = computeLeagueTable(scores, members, raceDates);
  assert.deepEqual(table, [
    { userId: "alice", totalScore: 15, racesScored: 2, rank: 1 },
    { userId: "bob", totalScore: 15, racesScored: 2, rank: 1 },
    { userId: "cara", totalScore: 3, racesScored: 1, rank: 3 },
  ]);
});

test("reconciles: table totals equal the sum of eligible score rows", () => {
  const table = computeLeagueTable(scores, members, raceDates);
  const joined = new Map(members.map((m) => [m.userId, m.joinedAt.slice(0, 10)]));
  const eligible = scores.filter((s) => joined.has(s.userId) && raceDates.get(s.raceId) && raceDates.get(s.raceId)! >= joined.get(s.userId)!);
  assert.equal(table.reduce((n, r) => n + r.totalScore, 0), eligible.reduce((n, s) => n + s.score, 0));
  assert.equal(table.reduce((n, r) => n + r.racesScored, 0), eligible.length);
  assert.ok(!table.some((r) => r.userId === "gone"));
});

test("empty without members", () => {
  assert.deepEqual(computeLeagueTable(scores, [], raceDates), []);
});
