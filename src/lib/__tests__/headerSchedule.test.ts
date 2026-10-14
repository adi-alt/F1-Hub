import { it } from "node:test";
import assert from "node:assert/strict";
import { headerStatus, shortRaceName, upcomingSessions } from "../headerSchedule";

const japan = {
  year: 2026,
  round: 18,
  name: "Japanese Grand Prix",
  status: "upcoming",
  sessions: [
    { label: "Practice 1", date: "2026-10-16T02:30:00" },
    { label: "Qualifying", date: "2026-10-17T06:00:00" },
    { label: "Race", date: "2026-10-18T05:00:00" },
  ],
};
const cancelled = { year: 2026, round: 19, name: "Cancelled Grand Prix", status: "cancelled", sessions: [{ label: "Race", date: "2026-10-25T05:00:00" }] };
const at = (iso: string) => Date.parse(iso);

it("keeps the sessions still to start or still running, in order, and drops cancelled rounds", () => {
  const s = upcomingSessions([cancelled, japan], at("2026-10-16T03:00:00Z"));
  // Practice 1 started at 02:30 and runs an hour, so at 03:00 it's still in.
  assert.deepEqual(s.map((x) => x.label), ["Practice 1", "Qualifying", "Grand Prix"]);
  assert.equal(upcomingSessions([japan], at("2026-10-16T04:00:00Z")).length, 2);
  assert.equal(upcomingSessions([japan], at("2026-10-16T00:00:00Z"), 1).length, 1);
});

it("says live during a session, else the next one with a countdown, else nothing", () => {
  const s = upcomingSessions([japan], at("2026-10-15T00:00:00Z"));
  assert.deepEqual(headerStatus(s, at("2026-10-16T03:00:00Z")), { kind: "live", session: s[0], countdown: "" });
  const next = headerStatus(s, at("2026-10-15T00:30:00Z"));
  assert.equal(next?.kind, "next");
  assert.equal(next?.session.label, "Practice 1");
  assert.equal(next?.countdown, "1d 2h");
  // After practice, before qualifying: qualifying is next.
  assert.equal(headerStatus(s, at("2026-10-16T12:00:00Z"))?.session.label, "Qualifying");
  assert.equal(headerStatus(s, at("2026-10-19T00:00:00Z")), null);
});

it("shortens a Grand Prix name", () => {
  assert.equal(shortRaceName("Japanese Grand Prix"), "Japanese GP");
  assert.equal(shortRaceName("Pre-Season Testing"), "Pre-Season Testing");
});
