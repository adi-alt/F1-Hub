// Fault injection for the home page (audit FEAT-06: the signed-in home failed as a whole if any of
// its reads threw). The page's data modules are replaced so each read can be made to fail, and the
// page must still render, with a partial-data notice, instead of throwing.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { mockModule } from "../../lib/__tests__/support/mockModule";

let failing = new Set<string>();
const read =
  <T,>(name: string, value: T) =>
  async (): Promise<T> => {
    if (failing.has(name)) throw new Error(`${name} failed (injected)`);
    return value;
  };

mockModule("@/lib/session/getSession", { getSession: async () => ({ uid: "user-1" }) });
mockModule("@/lib/supabase/races", { getNextUpcomingRace: read("nextRace", null), getRacesByYear: read("races", []) });
mockModule("@/lib/supabase/archive", { getAllArchiveCircuits: read("archiveCircuits", []) });
mockModule("@/lib/supabase/media", { getAllCurrentDrivers: read("currentDrivers", []) });
mockModule("@/lib/supabase/calendar", { getCalendarEntriesByYear: read("calendarEntries", []), getCalendarEntry: read("calendarEntry", null) });
mockModule("@/lib/personalization", {
  computeSeasonStandings: read("standings", { drivers: [], teams: [], poleCounts: {} }),
  getTrackHistory: read("trackHistory", null),
  getRecentCircuitPhotos: read("recentPhotos", []),
  buildFacts: () => [],
  buildSeasonRecap: () => null,
  buildPredictionInsight: read("predictionInsight", null),
});
mockModule("@/lib/homeData", { getPersonalHomeData: read("personalData", null) });
mockModule("@/lib/circuitSlug", { resolveCurrentCircuitToArchiveId: () => null });
mockModule("@/components/home/HomeShell", { HomeShell: function HomeShell() { return null; } });
mockModule("@/components/ui/RefreshAlert", { RefreshAlert: function RefreshAlert() { return null; } });

let HomePage: () => Promise<ReactElement>;
before(async () => {
  HomePage = (await import("../page")).default as unknown as () => Promise<ReactElement>;
});
beforeEach(() => {
  failing = new Set();
});

/** Every element in the tree the page returned, by component name. */
function names(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(names);
  if (!isValidElement(node)) return [];
  const type = node.type as string | { name?: string };
  const name = typeof type === "string" ? type : (type.name ?? "");
  return [name, ...names((node.props as { children?: ReactNode }).children)];
}

describe("home page fault tolerance", () => {
  test("with every read working there is no partial-data notice", async () => {
    const tree = names(await HomePage());
    assert.ok(tree.includes("HomeShell"));
    assert.ok(!tree.includes("RefreshAlert"));
  });

  for (const name of ["nextRace", "races", "archiveCircuits", "currentDrivers", "calendarEntries", "standings", "recentPhotos"]) {
    test(`a failing ${name} read still renders the page, with the notice`, async () => {
      failing = new Set([name]);
      const tree = names(await HomePage());
      assert.ok(tree.includes("HomeShell"), "the page itself still renders");
      assert.ok(tree.includes("RefreshAlert"), "and says part of it couldn't be loaded");
    });
  }

  test("every public read failing at once still renders the page", async () => {
    failing = new Set(["nextRace", "races", "archiveCircuits", "currentDrivers", "calendarEntries", "calendarEntry", "trackHistory", "recentPhotos", "standings"]);
    const tree = names(await HomePage());
    assert.ok(tree.includes("HomeShell") && tree.includes("RefreshAlert"));
  });

  test("a failing personal read leaves recovery to HomeShell (no page notice)", async () => {
    failing = new Set(["personalData"]);
    const tree = names(await HomePage());
    assert.ok(tree.includes("HomeShell"));
    assert.ok(!tree.includes("RefreshAlert"));
  });
});
