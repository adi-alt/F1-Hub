// Track-local session times (audit R-54): each circuit's zone, with its own daylight-saving rules applied for the
// session's date - the same UTC hour reads differently either side of a DST change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { circuitTimeZone, formatTrackTime } from "../circuitTimeZones";

test("resolves venues case- and accent-insensitively, null for unknown ones", () => {
  assert.equal(circuitTimeZone("Spa-Francorchamps"), "Europe/Brussels");
  assert.equal(circuitTimeZone("São Paulo"), "America/Sao_Paulo");
  assert.equal(circuitTimeZone("Montréal"), "America/Toronto");
  assert.equal(circuitTimeZone("Atlantis"), null);
  assert.equal(formatTrackTime("2026-07-26T13:00:00", "Atlantis"), null);
});

test("European summer time: Spa in July is UTC+2", () => {
  assert.match(formatTrackTime("2026-07-26T13:00:00", "Spa-Francorchamps") ?? "", /^Sun 15:00 (GMT\+2|CEST)$/);
});

test("the same circuit on standard time is UTC+1", () => {
  // Monza is in Europe/Rome too; a late-October date sits after the clocks go back (25 Oct 2026).
  assert.match(formatTrackTime("2026-10-25T13:00:00Z", "Monza") ?? "", /^Sun 14:00 (GMT\+1|CET)$/);
  assert.match(formatTrackTime("2026-10-24T13:00:00Z", "Monza") ?? "", /^Sat 15:00 (GMT\+2|CEST)$/);
});

test("southern-hemisphere daylight saving: Melbourne in March is UTC+11", () => {
  assert.match(formatTrackTime("2026-03-08T04:00:00", "Melbourne") ?? "", /^Sun 15:00 (GMT\+11|AEDT)$/);
});

test("US daylight saving ends a week later than Europe's: Austin", () => {
  assert.match(formatTrackTime("2026-10-25T19:00:00", "Austin") ?? "", /^Sun 14:00 (GMT-5|CDT)$/);
  assert.match(formatTrackTime("2026-11-08T20:00:00", "Austin") ?? "", /^Sun 14:00 (GMT-6|CST)$/);
});

test("no daylight saving: Sakhir", () => {
  assert.match(formatTrackTime("2026-04-12T15:00:00", "Sakhir") ?? "", /^Sun 18:00 (GMT\+3|AST)$/);
});
