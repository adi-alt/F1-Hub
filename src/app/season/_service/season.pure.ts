// Pure, dependency-free versions of season.service.ts's shared types and deterministic
// computations - no supabaseAdmin/getUserProfile/etc. imports, so client components (which now
// pull in SeasonDetail.tsx as a "use client" module) can import computeRecentForm/
// computePositionChanges without dragging server-only code into the browser bundle. Same
// deliberate split src/lib/championshipProgression.ts already uses for the same reason.
// season.service.ts re-exports everything here for its own (server-side) callers, so this is the
// one place these are actually defined - not a duplicate.
import type { ConstructorStanding, DriverStanding } from "@/lib/standings";

export type DriverStandingRow = DriverStanding & {
  headshotUrl: string | null;
  teamLogoUrl: string | null;
  favoriteId: string | null;
};

export type ConstructorStandingRow = ConstructorStanding & {
  logoUrl: string | null;
  favoriteId: string;
};

export type RaceResultSummary = {
  driver: string;
  driverName: string;
  team: string;
  finishPosition: number;
  points: number;
  grid: number | null;
  status: "finished" | "lapped" | "dnf";
};

export type RaceSessionSummary = { label: string; code: string; date: string; state: "completed" | "current" | "upcoming" };

export type RaceSummary = {
  round: number;
  name: string;
  trackShort: string;
  raceDate: string | null;
  state: "completed" | "next" | "upcoming";
  sessions: RaceSessionSummary[];
  poleSitter: string | null;
  results: RaceResultSummary[];
  hasQualifying: boolean;
};

export type Battle = {
  type: "drivers" | "constructors";
  aId: string;
  aLabel: string;
  aValue: number;
  bId: string;
  bLabel: string;
  bValue: number;
  gap: number;
  h2h?: H2HResult;
};

export function buildBattles(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[], raceSummaries: RaceSummary[] = []): Battle[] {
  const battles: Battle[] = [];
  for (let i = 0; i < drivers.length - 1; i++) {
    battles.push({
      type: "drivers",
      aId: drivers[i].driver,
      aLabel: drivers[i].driverName,
      aValue: drivers[i].points,
      bId: drivers[i + 1].driver,
      bLabel: drivers[i + 1].driverName,
      bValue: drivers[i + 1].points,
      gap: drivers[i].points - drivers[i + 1].points,
      h2h: raceSummaries.length > 0 ? computeHeadToHead(drivers[i].driver, drivers[i + 1].driver, raceSummaries, false, drivers[i].team === drivers[i + 1].team) : undefined,
    });
  }
  for (let i = 0; i < constructors.length - 1; i++) {
    battles.push({
      type: "constructors",
      aId: constructors[i].team,
      aLabel: constructors[i].team,
      aValue: constructors[i].points,
      bId: constructors[i + 1].team,
      bLabel: constructors[i + 1].team,
      bValue: constructors[i + 1].points,
      gap: constructors[i].points - constructors[i + 1].points,
      h2h: raceSummaries.length > 0 ? computeHeadToHead(constructors[i].team, constructors[i + 1].team, raceSummaries, true, false) : undefined,
    });
  }
  return battles.sort((a, b) => a.gap - b.gap).slice(0, 6);
}

export type SeasonRecord = { label: string; name: string; value: string };

export function buildRecords(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[], raceSummaries: RaceSummary[]): SeasonRecord[] {
  const records: SeasonRecord[] = [];
  const completed = raceSummaries.filter((r) => r.state === "completed");

  const mostWins = [...drivers].sort((a, b) => b.wins - a.wins)[0];
  if (mostWins?.wins > 0) records.push({ label: "Most wins", name: mostWins.driverName, value: String(mostWins.wins) });

  const mostPodiums = [...drivers].sort((a, b) => b.podiums - a.podiums)[0];
  if (mostPodiums?.podiums > 0) records.push({ label: "Most podiums", name: mostPodiums.driverName, value: String(mostPodiums.podiums) });

  const poleCounts = new Map<string, number>();
  for (const r of completed) if (r.poleSitter) poleCounts.set(r.poleSitter, (poleCounts.get(r.poleSitter) ?? 0) + 1);
  const topPole = [...poleCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPole) {
    const d = drivers.find((x) => x.driver === topPole[0]);
    records.push({ label: "Most poles", name: d?.driverName ?? topPole[0], value: String(topPole[1]) });
  }

  const avgFinishByDriver = new Map<string, number[]>();
  for (const r of completed) {
    for (const res of r.results) {
      const positions = avgFinishByDriver.get(res.driver);
      if (positions) positions.push(res.finishPosition);
      else avgFinishByDriver.set(res.driver, [res.finishPosition]);
    }
  }
  let bestAvg: { code: string; avg: number } | null = null;
  for (const [code, positions] of avgFinishByDriver) {
    if (positions.length < 3) continue;
    const avg = positions.reduce((s, p) => s + p, 0) / positions.length;
    if (!bestAvg || avg < bestAvg.avg) bestAvg = { code, avg };
  }
  if (bestAvg) {
    const d = drivers.find((x) => x.driver === bestAvg!.code);
    records.push({ label: "Best avg finish", name: d?.driverName ?? bestAvg.code, value: `P${bestAvg.avg.toFixed(1)}` });
  }

  const [leader, second] = drivers;
  if (leader && second) records.push({ label: "Points margin", name: `${leader.driverName} over ${second.driverName}`, value: String(leader.points - second.points) });

  const winners = new Set<string>();
  for (const r of completed) {
    const winner = r.results.find((x) => x.finishPosition === 1);
    if (winner) winners.add(winner.driverName);
  }
  if (winners.size > 0) records.push({ label: "Race winners", name: "Different drivers to win", value: String(winners.size) });

  const topTeam = constructors[0];
  if (topTeam) records.push({ label: "Constructors lead", name: topTeam.team, value: String(topTeam.points) });

  return records;
}

export type H2HResult = {
  aWins: number;
  bWins: number;
  ties: number;
  comparableRounds: number;
  excludedRounds: number;
  isTeammates: boolean;
};

export function computeHeadToHead(
  entityAId: string,
  entityBId: string,
  raceSummaries: RaceSummary[],
  isConstructors: boolean,
  isTeammates: boolean = false
): H2HResult {
  const result: H2HResult = { aWins: 0, bWins: 0, ties: 0, comparableRounds: 0, excludedRounds: 0, isTeammates };

  const completedRounds = raceSummaries.filter(r => r.state === "completed");

  for (const round of completedRounds) {
    if (isConstructors) {
      const teamA = round.results.filter(r => r.team === entityAId);
      const teamB = round.results.filter(r => r.team === entityBId);

      if (teamA.length === 0 || teamB.length === 0) {
        result.excludedRounds++;
        continue;
      }

      const ptsA = teamA.reduce((sum, r) => sum + r.points, 0);
      const ptsB = teamB.reduce((sum, r) => sum + r.points, 0);

      if (ptsA > ptsB) { result.aWins++; result.comparableRounds++; }
      else if (ptsB > ptsA) { result.bWins++; result.comparableRounds++; }
      else {
        const bestA = Math.min(...teamA.filter(r => r.status === "finished" || r.status === "lapped").map(r => r.finishPosition));
        const bestB = Math.min(...teamB.filter(r => r.status === "finished" || r.status === "lapped").map(r => r.finishPosition));
        if (isFinite(bestA) && isFinite(bestB)) {
          if (bestA < bestB) { result.aWins++; result.comparableRounds++; }
          else if (bestB < bestA) { result.bWins++; result.comparableRounds++; }
          else { result.ties++; result.comparableRounds++; }
        } else if (isFinite(bestA)) {
          result.aWins++; result.comparableRounds++;
        } else if (isFinite(bestB)) {
          result.bWins++; result.comparableRounds++;
        } else {
          result.ties++; result.comparableRounds++;
        }
      }
    } else {
      const resA = round.results.find(r => r.driver === entityAId);
      const resB = round.results.find(r => r.driver === entityBId);

      if (!resA || !resB) {
        result.excludedRounds++;
        continue;
      }

      result.comparableRounds++;

      const aFinished = resA.status === "finished" || resA.status === "lapped";
      const bFinished = resB.status === "finished" || resB.status === "lapped";

      if (aFinished && bFinished) {
        if (resA.finishPosition < resB.finishPosition) result.aWins++;
        else if (resB.finishPosition < resA.finishPosition) result.bWins++;
        else result.ties++;
      } else if (aFinished && !bFinished) {
        result.aWins++;
      } else if (!aFinished && bFinished) {
        result.bWins++;
      } else {
        if (resA.finishPosition < resB.finishPosition) result.aWins++;
        else if (resB.finishPosition < resA.finishPosition) result.bWins++;
        else result.ties++;
      }
    }
  }

  return result;
}

export type RecentForm = {
  roundsConsidered: number;
  totalPoints: number;
  averageFinish: number | null;
  averageGridPosition: number | null;
  positionsGained: number;
  wins: number;
  podiums: number;
  dnfs: number;
  recentAverageFinish: number | null;
  previousAverageFinish: number | null;
  finishDelta: number | null;
};

export function computeRecentForm(entityId: string, raceSummaries: RaceSummary[], isConstructors: boolean): RecentForm {
  const completedRounds = raceSummaries.filter(r => r.state === "completed");
  const windowSize = Math.min(5, completedRounds.length);
  const recentRounds = completedRounds.slice(-windowSize);

  const form: RecentForm = {
    roundsConsidered: windowSize,
    totalPoints: 0,
    averageFinish: null,
    averageGridPosition: null,
    positionsGained: 0,
    wins: 0,
    podiums: 0,
    dnfs: 0,
    recentAverageFinish: null,
    previousAverageFinish: null,
    finishDelta: null
  };

  if (windowSize === 0) return form;

  let finishSum = 0;
  let finishCount = 0;
  let gridSum = 0;
  let gridCount = 0;

  for (const round of recentRounds) {
    const results = round.results.filter(r => isConstructors ? r.team === entityId : r.driver === entityId);
    for (const res of results) {
      form.totalPoints += res.points;
      if (res.status === "finished" || res.status === "lapped") {
        finishSum += res.finishPosition;
        finishCount++;
        if (res.finishPosition === 1) form.wins++;
        if (res.finishPosition <= 3) form.podiums++;
      } else {
        form.dnfs++;
      }
      if (res.grid !== null && res.grid > 0) {
        gridSum += res.grid;
        gridCount++;
        if (res.status === "finished" || res.status === "lapped") {
          form.positionsGained += (res.grid - res.finishPosition);
        }
      }
    }
  }

  if (finishCount > 0) form.averageFinish = finishSum / finishCount;
  if (gridCount > 0) form.averageGridPosition = gridSum / gridCount;

  form.recentAverageFinish = form.averageFinish;

  const previousRounds = completedRounds.slice(0, Math.max(0, completedRounds.length - windowSize));
  if (previousRounds.length > 0) {
    let prevFinishSum = 0;
    let prevFinishCount = 0;
    for (const round of previousRounds) {
      const results = round.results.filter(r => isConstructors ? r.team === entityId : r.driver === entityId);
      for (const res of results) {
        if (res.status === "finished" || res.status === "lapped") {
          prevFinishSum += res.finishPosition;
          prevFinishCount++;
        }
      }
    }
    if (prevFinishCount > 0) {
      form.previousAverageFinish = prevFinishSum / prevFinishCount;
      if (form.recentAverageFinish !== null) {
        form.finishDelta = form.previousAverageFinish - form.recentAverageFinish;
      }
    }
  }

  return form;
}

export type Streak = {
  currentPointsStreak: number;
  longestPointsStreak: number;
  currentWinStreak: number;
  longestWinStreak: number;
  currentPodiumStreak: number;
  longestPodiumStreak: number;
};

export function computeStreaks(entityId: string, raceSummaries: RaceSummary[], isConstructors: boolean): Streak {
  const completedRounds = raceSummaries.filter(r => r.state === "completed");
  const streak: Streak = {
    currentPointsStreak: 0,
    longestPointsStreak: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    currentPodiumStreak: 0,
    longestPodiumStreak: 0
  };

  let currPoints = 0, currWin = 0, currPodium = 0;

  for (const round of completedRounds) {
    const results = round.results.filter(r => isConstructors ? r.team === entityId : r.driver === entityId);

    const roundPoints = results.reduce((sum, r) => sum + r.points, 0);
    if (roundPoints > 0) {
      currPoints++;
      streak.longestPointsStreak = Math.max(streak.longestPointsStreak, currPoints);
    } else {
      currPoints = 0;
    }

    const hasWin = results.some(r => r.finishPosition === 1);
    if (hasWin) {
      currWin++;
      streak.longestWinStreak = Math.max(streak.longestWinStreak, currWin);
    } else {
      currWin = 0;
    }

    const hasPodium = results.some(r => r.finishPosition <= 3 && r.finishPosition >= 1);
    if (hasPodium) {
      currPodium++;
      streak.longestPodiumStreak = Math.max(streak.longestPodiumStreak, currPodium);
    } else {
      currPodium = 0;
    }
  }

  streak.currentPointsStreak = currPoints;
  streak.currentWinStreak = currWin;
  streak.currentPodiumStreak = currPodium;

  return streak;
}

export type PositionChange = {
  entityId: string;
  currentPosition: number;
  previousPosition: number | null;
  positionDelta: number | null;
  pointsDelta: number | null;
};

export function computePositionChanges(
  currentDrivers: DriverStandingRow[],
  currentConstructors: ConstructorStandingRow[],
  progression: Record<string, number | string | null>[]
): { drivers: PositionChange[], constructors: PositionChange[] } {
  const result = { drivers: [] as PositionChange[], constructors: [] as PositionChange[] };

  if (progression.length < 2) {
    currentDrivers.forEach((d, i) => {
      result.drivers.push({ entityId: d.driver, currentPosition: i + 1, previousPosition: null, positionDelta: null, pointsDelta: null });
    });
    currentConstructors.forEach((c, i) => {
      result.constructors.push({ entityId: c.team, currentPosition: i + 1, previousPosition: null, positionDelta: null, pointsDelta: null });
    });
    return result;
  }

  const previousRoundState = progression[progression.length - 2];

  // `progression` is keyed by DRIVER code only (see getSeasonPageData/computeChampionshipProgression)
  // - reading previousRoundState[team] below for constructors would always land on `undefined`
  // (silently coerced to 0), making every constructor "previous points" reads as zero and the
  // resulting position/points deltas meaningless. Derive a team-keyed table the same way
  // ProgressionPanel's own teamProgression already does: sum each round's per-driver points by
  // that driver's CURRENT team (a real approximation for a mid-season driver swap, same trade-off
  // ProgressionPanel already accepts, not a new one introduced here).
  const previousTeamPoints: Record<string, number> = {};
  for (const d of currentDrivers) {
    const v = previousRoundState[d.driver];
    if (typeof v === "number") previousTeamPoints[d.team] = (previousTeamPoints[d.team] ?? 0) + v;
  }

  const prevDriverPoints = currentDrivers.map(d => ({
    id: d.driver,
    points: (previousRoundState[d.driver] as number) || 0,
    currentRank: currentDrivers.findIndex(x => x.driver === d.driver)
  })).sort((a, b) => b.points - a.points || a.currentRank - b.currentRank);

  currentDrivers.forEach((d, i) => {
    const currentPosition = i + 1;
    const previousPosition = prevDriverPoints.findIndex(x => x.id === d.driver) + 1;
    const currentPoints = d.points;
    const previousPoints = (previousRoundState[d.driver] as number) || 0;

    result.drivers.push({
      entityId: d.driver,
      currentPosition,
      previousPosition,
      positionDelta: previousPosition - currentPosition,
      pointsDelta: currentPoints - previousPoints
    });
  });

  const prevConstructorPoints = currentConstructors.map(c => ({
    id: c.team,
    points: previousTeamPoints[c.team] ?? 0,
    currentRank: currentConstructors.findIndex(x => x.team === c.team)
  })).sort((a, b) => b.points - a.points || a.currentRank - b.currentRank);

  currentConstructors.forEach((c, i) => {
    const currentPosition = i + 1;
    const previousPosition = prevConstructorPoints.findIndex(x => x.id === c.team) + 1;
    const currentPoints = c.points;
    const previousPoints = previousTeamPoints[c.team] ?? 0;

    result.constructors.push({
      entityId: c.team,
      currentPosition,
      previousPosition,
      positionDelta: previousPosition - currentPosition,
      pointsDelta: currentPoints - previousPoints
    });
  });

  return result;
}
