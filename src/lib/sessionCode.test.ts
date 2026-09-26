import { test } from "node:test";
import assert from "node:assert/strict";
import { liveSession, nextSession, sessionCode } from "./sessionCode";

test("sessionCode reads a short code back out of whatever FastF1 actually calls a session", () => {
  assert.equal(sessionCode("Practice 1"), "P1");
  assert.equal(sessionCode("Practice 3"), "P3");
  assert.equal(sessionCode("Sprint Qualifying"), "SQ");
  assert.equal(sessionCode("Sprint Shootout"), "SQ");
  assert.equal(sessionCode("Sprint"), "SR");
  assert.equal(sessionCode("Qualifying"), "Q");
  assert.equal(sessionCode("Race"), "R");
});

test("nextSession picks the earliest session that hasn't started yet, not always Race", () => {
  const sessions = [
    { label: "Practice 1", date: "2026-10-02T10:00:00" },
    { label: "Qualifying", date: "2026-10-03T14:00:00" },
    { label: "Race", date: "2026-10-04T14:00:00" },
  ];
  // Three days out - the countdown should point at Practice 1, not the Grand Prix itself.
  const beforeWeekend = new Date("2026-09-29T00:00:00Z").getTime();
  assert.equal(nextSession(sessions, beforeWeekend)?.label, "Practice 1");

  // Between qualifying and the race - it retargets to Qualifying, not Race.
  const afterFP1 = new Date("2026-10-02T12:00:00Z").getTime();
  assert.equal(nextSession(sessions, afterFP1)?.label, "Qualifying");

  // Between qualifying and the race itself.
  const afterQuali = new Date("2026-10-03T18:00:00Z").getTime();
  assert.equal(nextSession(sessions, afterQuali)?.label, "Race");
});

test("nextSession is null once every session has passed - the weekend is over, not stuck", () => {
  const sessions = [{ label: "Race", date: "2026-10-04T14:00:00" }];
  const afterRace = new Date("2026-10-04T20:00:00Z").getTime();
  assert.equal(nextSession(sessions, afterRace), null);
});

test("nextSession treats naive pipeline datetimes as UTC, not the runtime's local zone", () => {
  // A naive string an hour from now in UTC - if this were misparsed as local time in a
  // non-UTC-offset-zero environment, it would read as already past (or much further ahead).
  const nowMs = Date.now();
  const inOneHourUtc = new Date(nowMs + 60 * 60 * 1000).toISOString().slice(0, 19);
  const sessions = [{ label: "Practice 1", date: inOneHourUtc }];
  assert.equal(nextSession(sessions, nowMs)?.label, "Practice 1");
});

test("liveSession is the most recently started session, while it's still within its own typical length", () => {
  const sessions = [
    { label: "Practice 1", date: "2026-10-02T10:00:00" },
    { label: "Qualifying", date: "2026-10-03T14:00:00" },
    { label: "Race", date: "2026-10-04T14:00:00" },
  ];
  // 30 minutes into qualifying - still plausibly live.
  const duringQuali = new Date("2026-10-03T14:30:00Z").getTime();
  assert.equal(liveSession(sessions, duringQuali)?.label, "Qualifying");
});

test("liveSession is null before any session has started, and null again well after the last one", () => {
  const sessions = [{ label: "Race", date: "2026-10-04T14:00:00" }];
  const beforeRace = new Date("2026-10-04T13:00:00Z").getTime();
  assert.equal(liveSession(sessions, beforeRace), null);

  const longAfterRace = new Date("2026-10-04T20:00:00Z").getTime();
  assert.equal(liveSession(sessions, longAfterRace), null);
});

test("liveSession doesn't call a just-passed short session live once the next one is already well underway", () => {
  const sessions = [
    { label: "Sprint Qualifying", date: "2026-10-02T10:00:00" },
    { label: "Sprint", date: "2026-10-02T14:00:00" },
  ];
  // 3 hours after Sprint Qualifying started (well past its own typical length), and 1 minute into
  // Sprint - liveSession should read the field as "Sprint is live", not "Sprint Qualifying still
  // is" just because it looked at the two sessions in the wrong order.
  const duringSprint = new Date("2026-10-02T14:01:00Z").getTime();
  assert.equal(liveSession(sessions, duringSprint)?.label, "Sprint");
});
