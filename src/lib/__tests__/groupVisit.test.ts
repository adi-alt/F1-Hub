// "Since your last visit" advances once per visit, not once per render (audit R-19, COM-10): a render
// is not a visit. Every router.refresh() (a realtime event, a mutation) re-runs the server component,
// and stamping there reset the window to "now" in the middle of a visit.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("community visit stamp", () => {
  const stats = read("src/lib/supabase/groupStats.ts");
  const pulse = stats.slice(stats.indexOf("export async function getGroupPulse"));
  const pulseBody = pulse.slice(0, pulse.indexOf("\n}\n"));

  it("getGroupPulse only reads: no write may run on a render", () => {
    assert.ok(!/\.update\(/.test(pulseBody), "getGroupPulse must not write last_visit_at");
    assert.match(pulseBody, /last_visit_at/);
  });

  it("the stamp is its own function, written when a visit ends", () => {
    assert.match(stats, /export async function stampGroupVisit/);
    assert.match(read("src/app/api/groups/[id]/visit/route.ts"), /stampGroupVisit\(id, session\.uid\)/);
  });

  it("the page leaves the stamp to the beacon, which fires on hide, pagehide and unmount", () => {
    assert.match(read("src/app/groups/[id]/page.tsx"), /<GroupVisitBeacon groupId=\{id\} \/>/);
    const beacon = read("src/app/groups/[id]/components/GroupVisitBeacon.tsx");
    for (const needle of ["sendBeacon", "visibilitychange", "pagehide", "MIN_GAP_MS"]) assert.ok(beacon.includes(needle), needle);
  });
});
