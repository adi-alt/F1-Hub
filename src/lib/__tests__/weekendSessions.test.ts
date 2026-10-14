import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeekendSessions, defaultSession, sessionKeyOf } from "../weekendSessions";

// Singapore 2026 (sprint weekend) and a standard weekend, as the calendar lists them (UTC).
const sprint = [
  { label: "Practice 1", date: "2026-10-09T08:30:00" },
  { label: "Sprint Qualifying", date: "2026-10-09T12:30:00" },
  { label: "Sprint", date: "2026-10-10T09:00:00" },
  { label: "Qualifying", date: "2026-10-10T13:00:00" },
  { label: "Race", date: "2026-10-11T12:00:00" },
];
const standard = [
  { label: "Practice 1", date: "2026-09-04T11:30:00" },
  { label: "Practice 2", date: "2026-09-04T15:00:00" },
  { label: "Practice 3", date: "2026-09-05T10:30:00" },
  { label: "Qualifying", date: "2026-09-05T14:00:00" },
  { label: "Race", date: "2026-09-06T13:00:00" },
];
const at = (iso: string) => Date.parse(`${iso}Z`);

test("labels map to sessions, sprint shootout included", () => {
  assert.deepEqual(["Practice 1", "Sprint Shootout", "Sprint", "Qualifying", "Race", "Free Practice 3", "Pre-season test"].map(sessionKeyOf), ["FP1", "SQ", "S", "Q", "R", "FP3", null]);
});

test("a sprint weekend has the sprint sessions and only FP1 - nothing flagged as missing", () => {
  const s = buildWeekendSessions(sprint, {}, at("2026-10-01T00:00:00"));
  assert.deepEqual(s.map((x) => x.key), ["FP1", "SQ", "S", "Q", "R"]);
  assert.ok(s.every((x) => x.state === "upcoming"));
});

test("the default follows the weekend: next session, latest practice, sprint qualifying, sprint, qualifying, race", () => {
  const sp = (data: object, now: string) => defaultSession(buildWeekendSessions(sprint, data, at(now)));
  assert.equal(sp({}, "2026-10-08T00:00:00"), "FP1", "before anything: the first session to come");
  assert.equal(sp({ FP1: true }, "2026-10-09T11:00:00"), "FP1");
  assert.equal(sp({ FP1: true, SQ: true }, "2026-10-09T14:00:00"), "SQ");
  assert.equal(sp({ FP1: true, SQ: true, S: true }, "2026-10-10T10:00:00"), "S", "after the sprint, before GP qualifying");
  assert.equal(sp({ FP1: true, SQ: true, S: true, Q: true }, "2026-10-10T15:00:00"), "Q", "GP qualifying for Sunday");
  assert.equal(sp({ FP1: true, SQ: true, S: true, Q: true, R: true }, "2026-10-11T15:00:00"), "R");
  const st = (data: object, now: string) => defaultSession(buildWeekendSessions(standard, data, at(now)));
  assert.equal(st({ FP1: true, FP2: true }, "2026-09-04T17:00:00"), "FP2", "latest practice");
  assert.equal(st({ FP1: true, FP2: true, FP3: true, Q: true }, "2026-09-05T16:00:00"), "Q", "qualifying is primary once it's done");
});

test("states come from data first: run but no data yet is 'awaiting', during the session 'live'", () => {
  const s = buildWeekendSessions(sprint, { FP1: true }, at("2026-10-11T13:00:00"));
  const by = Object.fromEntries(s.map((x) => [x.key, x.state]));
  assert.equal(by.FP1, "completed");
  assert.equal(by.SQ, "awaiting", "its time passed, its data isn't in");
  assert.equal(by.R, "live", "an hour into the race");
  assert.equal(buildWeekendSessions(sprint, { R: true }, at("2026-10-11T12:10:00")).find((x) => x.key === "R")!.state, "completed", "data beats the clock");
});

test("an old round with data but no calendar sessions still gets its tabs, in weekend order", () => {
  assert.deepEqual(buildWeekendSessions([], { Q: true, FP2: true, R: true }, 0).map((x) => x.key), ["FP2", "Q", "R"]);
});
