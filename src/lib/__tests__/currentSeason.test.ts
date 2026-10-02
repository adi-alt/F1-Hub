import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSeasonFrom } from "../currentSeason";

const event = (year: number, race_date: string | null, status: string | null = "upcoming") => ({ year, race_date, status });
const season2026 = [event(2026, "2026-03-08", "completed"), event(2026, "2026-10-04"), event(2026, "2026-12-06")];

test("mid-season it is the season with races still to come", () => {
  assert.equal(currentSeasonFrom(season2026, "2026-10-02"), 2026);
});

test("after the last race, before next year's calendar exists, it stays on the finished season", () => {
  assert.equal(currentSeasonFrom(season2026, "2026-12-20"), 2026);
  assert.equal(currentSeasonFrom(season2026, "2027-01-02"), 2026, "not an empty 2027 on New Year's Day");
});

test("once next year's calendar is synced, it moves on", () => {
  const both = [...season2026, event(2027, "2027-03-14"), event(2027, "2027-12-05")];
  assert.equal(currentSeasonFrom(both, "2026-12-20"), 2027);
  assert.equal(currentSeasonFrom(both, "2026-11-01"), 2026, "the earliest season with races left wins");
});

test("cancelled events and missing dates don't count; no calendar means no answer", () => {
  assert.equal(currentSeasonFrom([event(2026, "2026-04-12", "cancelled"), event(2025, "2025-12-07", "completed")], "2026-03-01"), 2025);
  assert.equal(currentSeasonFrom([event(2026, null)], "2026-03-01"), 2026);
  assert.equal(currentSeasonFrom([], "2026-03-01"), null);
});
