import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSeasonFrom } from "../currentSeason";
import { archiveLatestYear } from "../archiveYears";
import { seasonStatus } from "../../app/season/_service/season.pure";

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

test("on 2 January 2027 the whole site agrees: 2026 is still live and the archive ends at 2025", () => {
  // The R-22 acceptance case: every 2026 race has run, no 2027 calendar is synced yet.
  const season = currentSeasonFrom(season2026, "2027-01-02")!;
  assert.equal(season, 2026, "the nav, the home page and every page's 'this season'");
  assert.equal(seasonStatus(2026, season), "ongoing", "2026 race pages read the live tables");
  assert.equal(archiveLatestYear(season), 2025, "the archive doesn't list an empty 2026 before it is promoted");
  // Once 2027 is synced the archive moves on to 2026 - which needs 2026 promoted into it by then.
  const synced = currentSeasonFrom([...season2026, { year: 2027, race_date: "2027-03-14", status: "upcoming" }], "2027-01-02")!;
  assert.equal(archiveLatestYear(synced), 2026);
  assert.equal(seasonStatus(2026, synced), "completed");
});
