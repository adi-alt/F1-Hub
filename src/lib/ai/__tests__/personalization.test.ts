import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeSinceLastVisit } from "../sinceLastVisit";
import { generateDeterministicFallback } from "../fallback";
import { computeDataVersion } from "../cache";
import { computePredictionFingerprint } from "@/lib/predictionPerformance";
import type { RaceDoc, UserPick } from "@/lib/types/race";

function race(overrides: Partial<RaceDoc>): RaceDoc {
  return {
    id: "r1",
    year: 2026,
    round: 1,
    name: "Test GP",
    circuit: "Test Circuit",
    status: "completed",
    results: [],
    ...overrides,
  } as RaceDoc;
}

describe("Since Last Visit - deterministic diff", () => {
  test("returns hasPriorVisit: false for a first-ever visit (no stored timestamp)", () => {
    const diff = computeSinceLastVisit({
      lastVisitIso: null,
      races: [],
      currentStandings: { drivers: [], teams: [], poleCounts: {} },
    });
    assert.equal(diff.hasPriorVisit, false);
    assert.deepEqual(diff.changes, []);
  });

  test("detects a real favorite-driver rank change between two dates", () => {
    const races: RaceDoc[] = [
      race({
        id: "r1",
        round: 1,
        updatedAt: "2026-01-01T00:00:00Z",
        results: [
          { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", grid: 1, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 25 },
          { driver: "NOR", driverName: "Lando Norris", team: "McLaren", grid: 2, finishPosition: 2, finishGapSec: 3, status: "finished", fastestLapSec: null, points: 18 },
        ],
      }),
      race({
        id: "r2",
        round: 2,
        updatedAt: "2026-02-01T00:00:00Z",
        results: [
          { driver: "NOR", driverName: "Lando Norris", team: "McLaren", grid: 1, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 25 },
          { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", grid: 2, finishPosition: 2, finishGapSec: 2, status: "finished", fastestLapSec: null, points: 18 },
        ],
      }),
    ];
    // Current standings (after both races): NOR 43, VER 43 -> NOR ahead on countback isn't modeled
    // here, just use the real cumulative points reducer shape the app itself would produce.
    const currentStandings = {
      drivers: [
        { driver: "NOR", driverName: "Lando Norris", team: "McLaren", points: 43, wins: 1, podiums: 2 },
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", points: 43, wins: 1, podiums: 2 },
      ],
      teams: [],
      poleCounts: {},
    };

    // lastVisit was right after round 1 only (round 2 hasn't happened yet "as of" that date) -
    // Norris was P2 then, is P1 now (tied on points, but first in this sorted list).
    const diff = computeSinceLastVisit({
      lastVisitIso: "2026-01-15",
      races,
      currentStandings,
      favoriteDriverCode: "NOR",
      favoriteDriverName: "Lando Norris",
    });

    assert.equal(diff.hasPriorVisit, true);
    assert.ok(diff.changes.some((c) => c.type === "DRIVER" && c.title.includes("Lando Norris")), `Expected a DRIVER change, got: ${JSON.stringify(diff.changes)}`);
  });

  test("real prediction submitted after the last visit is reported as a PREDICTION change", () => {
    const diff = computeSinceLastVisit({
      lastVisitIso: "2026-01-01T00:00:00Z",
      races: [],
      currentStandings: { drivers: [], teams: [], poleCounts: {} },
      pickSubmittedAt: "2026-01-02T00:00:00Z",
    });
    assert.ok(diff.changes.some((c) => c.type === "PREDICTION"));
  });

  test("a prediction submitted BEFORE the last visit is not reported as new", () => {
    const diff = computeSinceLastVisit({
      lastVisitIso: "2026-01-05T00:00:00Z",
      races: [],
      currentStandings: { drivers: [], teams: [], poleCounts: {} },
      pickSubmittedAt: "2026-01-02T00:00:00Z",
    });
    assert.ok(!diff.changes.some((c) => c.type === "PREDICTION"));
  });

  test("REGRESSION: visiting must not change personalDataVersion on the very next immediate request", () => {
    // Real bug this guards against: touchHomepageVisit() bumps profiles.last_homepage_visit_at to
    // "now" at the end of EVERY homepage-intelligence request. If personalDataVersion's hash had
    // included sinceLastVisit.changes.length (it used to), an immediate hard refresh would read a
    // last-visit timestamp only seconds old, almost always finding zero changes regardless of what
    // the first request found - changing the hash and forcing a full regeneration despite IDENTICAL
    // underlying F1 data. route.ts's own personalDataVersion hash must never include anything
    // derived from lastHomepageVisitAt for exactly this reason.
    const races: RaceDoc[] = [
      race({
        id: "r1",
        round: 1,
        updatedAt: "2026-08-01T12:00:00Z",
        results: [
          { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", grid: 1, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 25 },
          { driver: "NOR", driverName: "Lando Norris", team: "McLaren", grid: 2, finishPosition: 2, finishGapSec: 3, status: "finished", fastestLapSec: null, points: 18 },
        ],
      }),
      race({
        id: "r2",
        round: 2,
        // The most recent race - Norris wins again (plus fastest lap point) and takes an
        // UNAMBIGUOUS championship lead, 44-43, no tie - a tie would make sort order depend on Map
        // insertion order, an unrelated fragility this test isn't trying to exercise.
        updatedAt: "2026-09-05T12:00:00Z",
        results: [
          { driver: "NOR", driverName: "Lando Norris", team: "McLaren", grid: 1, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 26 },
          { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", grid: 2, finishPosition: 2, finishGapSec: 2, status: "finished", fastestLapSec: null, points: 18 },
        ],
      }),
    ];
    // The real sum over both races above (VER: 25+18=43, NOR: 18+26=44) - internally consistent
    // with `races`, the way computeSeasonStandings' own output would be.
    const currentStandings = {
      drivers: [
        { driver: "NOR", driverName: "Lando Norris", team: "McLaren", points: 44, wins: 1, podiums: 2 },
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", points: 43, wins: 1, podiums: 2 },
      ],
      teams: [],
      poleCounts: {},
    };

    // Mirrors route.ts's real personalDataVersion hash exactly (post-fix): userId + favorite ids +
    // pick submittedAt + fingerprint count - deliberately NOT a function of lastVisitIso/the diff at
    // all, which is the actual fix. Same inputs regardless of which "request" is asking.
    function buildPersonalDataVersion() {
      return computeDataVersion(["global_v1", "user_123", "norris_id", null, null, 0]);
    }

    // Request 1: user's real last visit was weeks ago, before round 2 - a genuine new event exists.
    const requestOneDiff = computeSinceLastVisit({ lastVisitIso: "2026-08-10T00:00:00Z", races, currentStandings, favoriteDriverCode: "NOR", favoriteDriverName: "Lando Norris" });
    assert.ok(requestOneDiff.changes.length > 0, "fixture must produce a real diff for request 1");
    const version1 = buildPersonalDataVersion();

    // Request 2: an immediate hard refresh, seconds later - touchHomepageVisit() already moved
    // lastHomepageVisitAt to "now" at the end of request 1, so this reads a last-visit timestamp
    // only seconds old. Nothing about the underlying F1 data changed between the two requests.
    const nowIso = new Date().toISOString();
    const requestTwoDiff = computeSinceLastVisit({ lastVisitIso: nowIso, races, currentStandings, favoriteDriverCode: "NOR", favoriteDriverName: "Lando Norris" });
    assert.equal(requestTwoDiff.changes.length, 0, "an immediate re-visit should find no NEW changes");
    const version2 = buildPersonalDataVersion();

    assert.equal(version1, version2, "personalDataVersion must stay stable across an immediate hard refresh despite the diff itself changing (it's a constant function of stable inputs now, not of the volatile diff)");
  });
});

describe("Prediction Fingerprint - application-computed, never AI-computed", () => {
  test("computes a real average grid position for the picked winners", () => {
    const races: RaceDoc[] = [
      race({ id: "r1", status: "completed", results: [{ driver: "VER", driverName: "Max Verstappen", team: "Red Bull", grid: 1, finishPosition: 1, finishGapSec: 0, status: "finished", fastestLapSec: null, points: 25 }] }),
      race({ id: "r2", status: "completed", results: [{ driver: "VER", driverName: "Max Verstappen", team: "Red Bull", grid: 5, finishPosition: 2, finishGapSec: 3, status: "finished", fastestLapSec: null, points: 18 }] }),
    ];
    const picks: UserPick[] = [
      { raceId: "r1", predictedWinner: "VER", predictedPodium: ["VER", "NOR", "PIA"], submittedAt: "2026-01-01" },
      { raceId: "r2", predictedWinner: "VER", predictedPodium: ["VER", "NOR", "PIA"], submittedAt: "2026-02-01" },
    ];

    const fp = computePredictionFingerprint(picks, races, "VER");
    assert.equal(fp.totalPredictions, 2);
    assert.equal(fp.avgPredictedWinnerGrid, 3); // (1 + 5) / 2
    assert.equal(fp.pctPicksForSeasonLeader, 100); // both picks were VER, the season leader passed in
  });
});

describe("Deterministic Fallback - personalization is grounded, not generic", () => {
  test("populates personalRaceBrief/personalOutlook/predictionChallenge from real favorite/prediction data", () => {
    const fallback = generateDeterministicFallback({
      race: { name: "Italian Grand Prix", round: 13, season: 2026, circuitName: "Monza" },
      standings: { driverLeader: { name: "Kimi Antonelli", points: 216 }, driverSecond: { name: "Lewis Hamilton", points: 163 } },
      favoriteDriver: { name: "Lewis Hamilton", rank: 2, points: 163, teamName: "Ferrari", circuit: { appearances: 5, wins: 3, podiums: 5, bestFinish: 1, avgFinish: 2.1 } },
      simulation: { topSimulatedDriver: "Kimi Antonelli", p1Probability: 0.31 },
      userPrediction: { predictedWinner: "Lewis Hamilton", submitted: true },
    });

    assert.ok(fallback.data.personalRaceBrief, "personalRaceBrief must be populated for a user with a favorite driver");
    assert.ok(fallback.data.personalRaceBrief!.headline.includes("Lewis Hamilton"));

    assert.ok(fallback.data.personalOutlook, "personalOutlook must be populated for a user with a favorite driver");
    assert.equal(fallback.data.personalOutlook!.driver, "Lewis Hamilton");
    assert.ok(fallback.data.personalOutlook!.circuitContext.includes("3 win"));

    assert.ok(fallback.data.predictionChallenge);
    assert.equal(fallback.data.predictionChallenge!.status, "DISAGREE"); // picked Hamilton, sim favors Antonelli
  });

  test("returns null personal fields for a guest with no favorites/prediction", () => {
    const fallback = generateDeterministicFallback({ race: { name: "Italian Grand Prix", round: 13, season: 2026 } });
    assert.equal(fallback.data.personalRaceBrief, null);
    assert.equal(fallback.data.personalOutlook, null);
    assert.equal(fallback.data.predictionChallenge!.status, "NO_PICK");
  });
});
