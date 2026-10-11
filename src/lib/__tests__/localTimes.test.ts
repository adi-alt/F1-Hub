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

describe("the server never decides what zone a viewer sees", () => {
  it("renders UTC on the server and during hydration, so the browser's own zone replaces it afterwards", async () => {
    const { createElement } = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { useViewerTimeZone } = await import("../../hooks/useViewerTimeZone");
    function Probe() {
      const tz = useViewerTimeZone();
      return createElement("p", null, formatLocalDateTime("2026-10-04T07:00:00", tz));
    }
    const html = renderToString(createElement(Probe));
    assert.match(html, /7:00\s?AM UTC/, "the server's text is explicit UTC, not whatever zone the server is in");
  });

  it("the explicit zone is honoured, so UTC is UTC wherever the code runs", () => {
    assert.match(formatLocalDateTime("2026-10-04T07:00:00", "UTC"), /7:00\s?AM UTC/);
    assert.match(formatLocalDateTime("2026-10-04T07:00:00", "America/New_York"), /3:00\s?AM/);
  });

  it("no component leaves a locale-formatted time to suppressHydrationWarning: React keeps the server's text", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const file of ["components/race/RaceWeekendPanel.tsx", "components/raceDetail/RaceSidebar.tsx", "components/race/PickPanel.tsx", "components/home/RaceReadiness.tsx"]) {
      const source = fs.readFileSync(path.join(process.cwd(), "src", file), "utf8");
      assert.ok(source.includes("useViewerTimeZone"), `${file} must format times through useViewerTimeZone`);
      assert.ok(!source.includes("suppressHydrationWarning"), `${file} must not hide a zone mismatch`);
    }
  });
});
