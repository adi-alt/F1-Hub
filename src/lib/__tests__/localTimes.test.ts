// Session times are shown in the viewer's own zone WITH the day and the zone's name. A bare "Sun 12:30"
// (and "Live now" in place of the time) left people unable to tell when the race started or when picks close.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { formatLocalDateTime, formatLocalTime, localZoneLabel } from "../countdown";

describe("local session times", () => {
  before(() => {
    process.env.TZ = "Asia/Kolkata";
  });

  it("converts the pipeline's naive UTC string to the viewer's clock, with day and zone", () => {
    const text = formatLocalDateTime("2026-10-04T07:00:00");
    assert.match(text, /Sun/);
    assert.match(text, /4/);
    assert.match(text, /Oct/);
    assert.match(text, /12:30/);
    assert.match(text, /GMT\+5:30|IST/);
  });

  it("the time-only form still names the zone", () => {
    assert.match(formatLocalTime("2026-10-04T07:00:00"), /12:30.*(GMT\+5:30|IST)/);
  });

  it("names the viewer's zone", () => {
    assert.match(localZoneLabel(), /GMT\+5:30|IST/);
  });
});
