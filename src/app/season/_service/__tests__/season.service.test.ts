import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeHeadToHead, computeRecentForm, computeStreaks, computePositionChanges, type RaceSummary, type DriverStandingRow, type ConstructorStandingRow } from "../season.pure";

describe("season.service deterministic computations", () => {
  const mockRaceSummaries: RaceSummary[] = [
    {
      round: 1,
      name: "Bahrain GP",
      trackShort: "BHR",
      raceDate: "2024-03-02",
      state: "completed",
      sessions: [],
      poleSitter: "VER",
      results: [
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", finishPosition: 1, points: 25, grid: 1, status: "finished" },
        { driver: "LEC", driverName: "Charles Leclerc", team: "Ferrari", finishPosition: 2, points: 18, grid: 2, status: "finished" },
        { driver: "NOR", driverName: "Lando Norris", team: "McLaren", finishPosition: 3, points: 15, grid: 3, status: "finished" },
        { driver: "PER", driverName: "Sergio Perez", team: "Red Bull", finishPosition: 4, points: 12, grid: 5, status: "finished" },
        { driver: "SAI", driverName: "Carlos Sainz", team: "Ferrari", finishPosition: 20, points: 0, grid: 4, status: "dnf" },
      ],
      hasQualifying: true
    },
    {
      round: 2,
      name: "Saudi Arabian GP",
      trackShort: "SAU",
      raceDate: "2024-03-09",
      state: "completed",
      sessions: [],
      poleSitter: "VER",
      results: [
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", finishPosition: 1, points: 25, grid: 1, status: "finished" },
        { driver: "PER", driverName: "Sergio Perez", team: "Red Bull", finishPosition: 2, points: 18, grid: 3, status: "finished" },
        { driver: "LEC", driverName: "Charles Leclerc", team: "Ferrari", finishPosition: 3, points: 15, grid: 2, status: "finished" },
        { driver: "NOR", driverName: "Lando Norris", team: "McLaren", finishPosition: 4, points: 12, grid: 4, status: "finished" },
        { driver: "SAI", driverName: "Carlos Sainz", team: "Ferrari", finishPosition: 19, points: 0, grid: 5, status: "dnf" }, // DNS/DNF
      ],
      hasQualifying: true
    },
    {
      round: 3,
      name: "Australian GP",
      trackShort: "AUS",
      raceDate: "2024-03-24",
      state: "completed",
      sessions: [],
      poleSitter: "VER",
      results: [
        { driver: "SAI", driverName: "Carlos Sainz", team: "Ferrari", finishPosition: 1, points: 25, grid: 2, status: "finished" },
        { driver: "LEC", driverName: "Charles Leclerc", team: "Ferrari", finishPosition: 2, points: 18, grid: 4, status: "finished" },
        { driver: "NOR", driverName: "Lando Norris", team: "McLaren", finishPosition: 3, points: 15, grid: 3, status: "finished" },
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", finishPosition: 20, points: 0, grid: 1, status: "dnf" },
        { driver: "PER", driverName: "Sergio Perez", team: "Red Bull", finishPosition: 5, points: 10, grid: 6, status: "finished" },
      ],
      hasQualifying: true
    }
  ];

  describe("computeHeadToHead", () => {
    it("computes normal h2h", () => {
      const res = computeHeadToHead("VER", "LEC", mockRaceSummaries, false);
      assert.strictEqual(res.aWins, 2);
      assert.strictEqual(res.bWins, 1);
      assert.strictEqual(res.ties, 0);
      assert.strictEqual(res.comparableRounds, 3);
    });

    it("handles one DNF", () => {
      // In round 3, VER is DNF, SAI finishes
      const res = computeHeadToHead("VER", "SAI", mockRaceSummaries, false);
      // R1: VER P1, SAI DNF -> VER wins
      // R2: VER P1, SAI DNF -> VER wins
      // R3: VER DNF, SAI P1 -> SAI wins
      assert.strictEqual(res.aWins, 2);
      assert.strictEqual(res.bWins, 1);
    });
  });

  describe("computeRecentForm", () => {
    it("computes form correctly over available rounds", () => {
      const form = computeRecentForm("VER", mockRaceSummaries, false);
      assert.strictEqual(form.roundsConsidered, 3);
      assert.strictEqual(form.wins, 2);
      assert.strictEqual(form.dnfs, 1);
      assert.strictEqual(form.totalPoints, 50);
      assert.strictEqual(form.averageFinish, 1); // avg of finished races (1, 1) -> 1.0
    });
  });

  describe("computeStreaks", () => {
    it("computes active streaks", () => {
      const streak = computeStreaks("LEC", mockRaceSummaries, false);
      assert.strictEqual(streak.currentPointsStreak, 3);
      assert.strictEqual(streak.longestPointsStreak, 3);
      assert.strictEqual(streak.currentPodiumStreak, 3);
      assert.strictEqual(streak.longestPodiumStreak, 3);
    });

    it("computes broken streaks", () => {
      const streak = computeStreaks("VER", mockRaceSummaries, false);
      // R1: points, R2: points, R3: 0 points (DNF)
      assert.strictEqual(streak.currentPointsStreak, 0);
      assert.strictEqual(streak.longestPointsStreak, 2);
      assert.strictEqual(streak.currentWinStreak, 0);
      assert.strictEqual(streak.longestWinStreak, 2);
    });
  });
  
  describe("computePositionChanges", () => {
    it("computes pos and point deltas correctly", () => {
      const currentDrivers: DriverStandingRow[] = [
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", points: 50, headshotUrl: null, teamLogoUrl: null, favoriteId: null, wins: 2, podiums: 2 },
        { driver: "LEC", driverName: "Charles Leclerc", team: "Ferrari", points: 51, headshotUrl: null, teamLogoUrl: null, favoriteId: null, wins: 0, podiums: 3 },
      ];
      const currentConstructors: ConstructorStandingRow[] = [];
      // In round 2 (previous to 3): VER had 50 pts, LEC had 33 pts.
      const progression = [
        { round: 1, VER: 25, LEC: 18 },
        { round: 2, VER: 50, LEC: 33 }, // Previous round
        { round: 3, VER: 50, LEC: 51 }, // Current round
      ];

      const changes = computePositionChanges(currentDrivers, currentConstructors, progression);
      assert.strictEqual(changes.drivers.length, 2);
      
      const ver = changes.drivers.find(d => d.entityId === "VER")!;
      // VER was 1st with 50, now 1st with 50... wait, currentDrivers passed as argument dictates current pos!
      // In currentDrivers, VER is index 0 (currentPos = 1) and LEC is index 1 (currentPos = 2).
      // Let's match array index.
      assert.strictEqual(ver.previousPosition, 1); // VER had 50 in R2, LEC had 33, so VER was 1st
      assert.strictEqual(ver.currentPosition, 1); // from array index
      assert.strictEqual(ver.positionDelta, 0);
      assert.strictEqual(ver.pointsDelta, 0);
      
      const lec = changes.drivers.find(d => d.entityId === "LEC")!;
      assert.strictEqual(lec.previousPosition, 2);
      assert.strictEqual(lec.currentPosition, 2);
      assert.strictEqual(lec.pointsDelta, 18); // 51 - 33
    });

    it("computes constructor deltas from a team-keyed derivation, not the driver-keyed progression directly", () => {
      // REGRESSION: progression is keyed by DRIVER code only - reading previousRoundState[team]
      // straight off it (the original bug) always resolved to undefined/0, so every constructor's
      // previousPoints silently read as 0 regardless of the real previous round.
      const currentDrivers: DriverStandingRow[] = [
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", points: 50, headshotUrl: null, teamLogoUrl: null, favoriteId: null, wins: 2, podiums: 2 },
        { driver: "PER", driverName: "Sergio Perez", team: "Red Bull", points: 20, headshotUrl: null, teamLogoUrl: null, favoriteId: null, wins: 0, podiums: 1 },
        { driver: "LEC", driverName: "Charles Leclerc", team: "Ferrari", points: 51, headshotUrl: null, teamLogoUrl: null, favoriteId: null, wins: 0, podiums: 3 },
      ];
      const currentConstructors: ConstructorStandingRow[] = [
        { team: "Red Bull", points: 70, wins: 2, podiums: 3, logoUrl: null, favoriteId: "red-bull" },
        { team: "Ferrari", points: 51, wins: 0, podiums: 3, logoUrl: null, favoriteId: "ferrari" },
      ];
      const progression = [
        { round: 1, VER: 25, PER: 8, LEC: 18 },
        { round: 2, VER: 50, PER: 15, LEC: 33 }, // previous round: Red Bull = 65, Ferrari = 33
        { round: 3, VER: 50, PER: 20, LEC: 51 }, // current round
      ];

      const changes = computePositionChanges(currentDrivers, currentConstructors, progression);
      const redBull = changes.constructors.find(c => c.entityId === "Red Bull")!;
      const ferrari = changes.constructors.find(c => c.entityId === "Ferrari")!;
      assert.strictEqual(redBull.pointsDelta, 5); // 70 - 65, not 70 - 0
      assert.strictEqual(ferrari.pointsDelta, 18); // 51 - 33, not 51 - 0
      assert.strictEqual(redBull.previousPosition, 1); // Red Bull led on 65 last round too
      assert.strictEqual(ferrari.previousPosition, 2);
    });
  });
});

