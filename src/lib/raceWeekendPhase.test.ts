import { test } from "node:test";
import assert from "node:assert/strict";
import { raceWeekendPhase } from "./raceWeekendPhase";
import { homeWeekendMode } from "./homeWeekendMode";

const sessions = [
  { label: "Practice 1", date: "2026-10-02T10:00:00" },
  { label: "Qualifying", date: "2026-10-03T14:00:00" },
  { label: "Race", date: "2026-10-04T14:00:00" },
];
const at = (iso: string) => new Date(`${iso}Z`).getTime();
const upcoming = { status: "upcoming" };

test("before qualifying (practice included) the weekend is pre-quali", () => {
  assert.equal(raceWeekendPhase(upcoming, sessions, at("2026-10-01T10:00:00")).phase, "pre-quali");
  assert.equal(raceWeekendPhase(upcoming, sessions, at("2026-10-02T10:30:00")).phase, "pre-quali");
});

test("qualifying and the race are live while they run", () => {
  const q = raceWeekendPhase(upcoming, sessions, at("2026-10-03T14:30:00"));
  assert.equal(q.phase, "live");
  assert.equal(q.liveSession?.label, "Qualifying");
  assert.equal(raceWeekendPhase(upcoming, sessions, at("2026-10-04T15:00:00")).phase, "live");
});

test("after qualifying, by the clock or by a stored grid, it is post-quali", () => {
  assert.equal(raceWeekendPhase(upcoming, sessions, at("2026-10-03T18:00:00")).phase, "post-quali");
  assert.equal(raceWeekendPhase({ status: "upcoming", inputs: [{ grid: 1 }] }, [], 0).phase, "post-quali");
  assert.equal(raceWeekendPhase({ status: "upcoming", poleSitter: "VER" }, [], 0).phase, "post-quali");
});

test("the home stays on the last race's outcome for three days, then follows the next weekend", () => {
  const last = { sessions: [{ label: "Race", date: "2026-09-27T14:00:00" }] };
  const next = { race: upcoming, sessions };
  assert.equal(homeWeekendMode({ next, last, nowMs: at("2026-09-28T10:00:00") })?.race, "last");
  const later = homeWeekendMode({ next, last, nowMs: at("2026-10-01T10:00:00") });
  assert.equal(later?.race, "next");
  assert.equal(later?.phase, "pre-quali");
  assert.equal(homeWeekendMode({ next: null, last: null, nowMs: 0 }), null);
});

test("a completed race, or one with results, is post-race", () => {
  assert.equal(raceWeekendPhase({ status: "completed" }, sessions, at("2026-10-04T15:00:00")).phase, "post-race");
  assert.equal(raceWeekendPhase({ status: "upcoming", results: [{}] }, sessions, 0).phase, "post-race");
});
