import { describe, expect, it } from "vitest";
import { computeHeadToHead, computeRecentForm, computeStreaks, computePositionChanges, type RaceSummary, type DriverStandingRow, type ConstructorStandingRow } from "../season.service";

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
      expect(res.aWins).toBe(2);
      expect(res.bWins).toBe(1);
      expect(res.ties).toBe(0);
      expect(res.comparableRounds).toBe(3);
    });

    it("handles one DNF", () => {
      // In round 3, VER is DNF, SAI finishes
      const res = computeHeadToHead("VER", "SAI", mockRaceSummaries, false);
      // R1: VER P1, SAI DNF -> VER wins
      // R2: VER P1, SAI DNF -> VER wins
      // R3: VER DNF, SAI P1 -> SAI wins
      expect(res.aWins).toBe(2);
      expect(res.bWins).toBe(1);
    });
  });

  describe("computeRecentForm", () => {
    it("computes form correctly over available rounds", () => {
      const form = computeRecentForm("VER", mockRaceSummaries, false);
      expect(form.roundsConsidered).toBe(3);
      expect(form.wins).toBe(2);
      expect(form.dnfs).toBe(1);
      expect(form.totalPoints).toBe(50);
      expect(form.averageFinish).toBe(1); // avg of finished races (1, 1) -> 1.0
    });
  });

  describe("computeStreaks", () => {
    it("computes active streaks", () => {
      const streak = computeStreaks("LEC", mockRaceSummaries, false);
      expect(streak.currentPointsStreak).toBe(3);
      expect(streak.longestPointsStreak).toBe(3);
      expect(streak.currentPodiumStreak).toBe(3);
      expect(streak.longestPodiumStreak).toBe(3);
    });

    it("computes broken streaks", () => {
      const streak = computeStreaks("VER", mockRaceSummaries, false);
      // R1: points, R2: points, R3: 0 points (DNF)
      expect(streak.currentPointsStreak).toBe(0);
      expect(streak.longestPointsStreak).toBe(2);
      expect(streak.currentWinStreak).toBe(0);
      expect(streak.longestWinStreak).toBe(2);
    });
  });
  
  describe("computePositionChanges", () => {
    it("computes pos and point deltas correctly", () => {
      const currentDrivers = [
        { driver: "VER", driverName: "Max Verstappen", team: "Red Bull", points: 50, headshotUrl: null, teamLogoUrl: null, favoriteId: null, wins: 2, podiums: 2 },
        { driver: "LEC", driverName: "Charles Leclerc", team: "Ferrari", points: 51, headshotUrl: null, teamLogoUrl: null, favoriteId: null, wins: 0, podiums: 3 },
      ];
      // In round 2 (previous to 3): VER had 50 pts, LEC had 33 pts.
      const progression = [
        { round: 1, VER: 25, LEC: 18 },
        { round: 2, VER: 50, LEC: 33 }, // Previous round
        { round: 3, VER: 50, LEC: 51 }, // Current round
      ];
      
      const changes = computePositionChanges(currentDrivers as any, [] as any, progression);
      expect(changes.drivers.length).toBe(2);
      
      const ver = changes.drivers.find(d => d.entityId === "VER")!;
      // VER was 1st with 50, now 1st with 50... wait, currentDrivers passed as argument dictates current pos!
      // In currentDrivers, VER is index 0 (currentPos = 1) and LEC is index 1 (currentPos = 2).
      // Let's match array index.
      expect(ver.previousPosition).toBe(1); // VER had 50 in R2, LEC had 33, so VER was 1st
      expect(ver.currentPosition).toBe(1); // from array index
      expect(ver.positionDelta).toBe(0);
      expect(ver.pointsDelta).toBe(0);
      
      const lec = changes.drivers.find(d => d.entityId === "LEC")!;
      expect(lec.previousPosition).toBe(2);
      expect(lec.currentPosition).toBe(2);
      expect(lec.pointsDelta).toBe(18); // 51 - 33
    });
  });
});
