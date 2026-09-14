// Pure, dependency-free versions of season.service.ts's shared types and deterministic
// computations - no supabaseAdmin/getUserProfile/etc. imports, so client components (which now
// pull in SeasonDetail.tsx as a "use client" module) can import computeRecentForm/
// computePositionChanges without dragging server-only code into the browser bundle. Same
// deliberate split src/lib/championshipProgression.ts already uses for the same reason.
// season.service.ts re-exports everything here for its own (server-side) callers, so this is the
// one place these are actually defined - not a duplicate.
import type { ConstructorStanding, DriverStanding } from "@/lib/standings";
// Type-only imports (fully erased at build time) - no server-only module ever reaches the client
// bundle through them, same rule the rest of this file follows.
import type { WeatherForecast } from "@/lib/supabase/calendar";
import type { SessionWeather } from "@/lib/types/race";

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

export type RaceSessionSummary = {
  label: string;
  code: string;
  date: string;
  state: "completed" | "current" | "upcoming";
  /** A real, already-known outcome for a session that has run ("Winner", "Pole", "Fastest"), or
   * null. Never a placeholder - a session whose result this app genuinely doesn't have (a sprint
   * race, which the pipeline stores no separate classification for) shows nothing rather than an
   * invented line. */
  result: { label: string; value: string } | null;
};

/** Where a weekend actually is. `live` means the weekend has started (its first session time has
 * passed) but the race itself hasn't been classified yet - the state that makes "current
 * conditions" and "next session" meaningful rather than a forecast.
 *
 * `cancelled`/`postponed` are carried because a weekend really can be either, and the UI must not
 * show a normal countdown for one; today's pipeline (sync_calendar.py) only ever writes
 * completed/upcoming, so these arrive only if the calendar row itself says so - they are mapped
 * through, never guessed at. */
export type RaceWeekendStatus = "upcoming" | "live" | "completed" | "cancelled" | "postponed";

export type RacePodiumEntry = { position: number; driver: string; driverName: string; team: string };

/** What Apex predicted BEFORE the weekend, for the post-race prediction review. Sourced from the
 * race's own frozen prediction/simulation documents (see RaceDoc's freeze rules) - it exists only
 * for rounds the model actually ran on, and is null otherwise rather than back-filled. */
export type RacePredictionSummary = {
  winner: string | null;
  podium: string[];
  pole: string | null;
  source: "simulation" | "model";
};

export type RaceSummary = {
  round: number;
  name: string;
  trackShort: string;
  raceDate: string | null;
  /** Position in the season's own sequence - "next" is the one upcoming round the page points at.
   * For "has this weekend started / is it over", use `weekendStatus`, which is about the event
   * itself rather than its place in the calendar. */
  state: "completed" | "next" | "upcoming";
  sessions: RaceSessionSummary[];
  poleSitter: string | null;
  results: RaceResultSummary[];
  hasQualifying: boolean;

  // ── Event detail, for the race window. All of it real pipeline data; anything the pipeline
  // doesn't have for a given round arrives null/empty rather than invented.
  circuit: string | null;
  country: string | null;
  eventFormat: string | null;
  isSprintWeekend: boolean;
  weekendStatus: RaceWeekendStatus;
  /** Real race photography (Wikimedia Commons, re-hosted in Storage) - not circuit diagrams. Only
   * exists once this specific round has actually been processed (a `races`/`archive_races` row
   * with results or at least practice data) - most of a season's still-to-run rounds have none. */
  photoUrls: string[];
  /** The circuit's own real photography, independent of whether THIS round has run yet - circuits
   * are known well ahead of the calendar and archive_circuits is backfilled from the venue itself,
   * not from a specific race weekend. The fallback for every round photoUrls is empty for, never a
   * fabricated or wrong-venue substitute: null when even the circuit hasn't been matched yet. */
  circuitPhotoUrls: string[];
  /** Pre-event forecast snapshot, written once by the pipeline when the race was close enough. */
  forecast: WeatherForecast | null;
  /** What the weather actually was during the session, for a race that has run. */
  raceWeather: SessionWeather | null;
  podium: RacePodiumEntry[];
  winnerName: string | null;
  poleSitterName: string | null;
  fastestLap: { driver: string; driverName: string; lapTimeSec: number } | null;
  predicted: RacePredictionSummary | null;
};

/** THE definition of "a completed round" for the whole Season page. Every consumer - standings
 * deltas, recent form, streaks, head-to-head, records, AI context, cache keys, the race window -
 * goes through these two rather than re-deriving `r.state === "completed"` inline, so no two
 * components can ever disagree about how much of the season has actually happened. */
export function completedRaces(raceSummaries: RaceSummary[]): RaceSummary[] {
  return raceSummaries.filter((r) => r.state === "completed");
}

export function completedRoundCount(raceSummaries: RaceSummary[]): number {
  return completedRaces(raceSummaries).length;
}

/** The window every "recent form" number on the page is measured over - one constant, so
 * "last 5" in the snapshot, the standings row detail, and the AI context all mean the same 5. */
export const RECENT_FORM_WINDOW = 5;

export type EntityType = "drivers" | "constructors";

export type ResultPoint = { round: number; trackShort: string; position: number; points: number; grid: number | null; dnf: boolean };

/** One entity's per-round results across every COMPLETED round. A team's result for a weekend is
 * its higher-finishing car (and the sum of both cars' points) - the one convention the standings
 * table, Compare, and the AI context all share. */
export function entityResults(raceSummaries: RaceSummary[], id: string, isConstructors: boolean): ResultPoint[] {
  const out: ResultPoint[] = [];
  for (const r of completedRaces(raceSummaries)) {
    if (isConstructors) {
      const entries = r.results.filter((x) => x.team === id);
      if (entries.length === 0) continue;
      const best = entries.reduce((a, b) => (a.finishPosition < b.finishPosition ? a : b));
      out.push({
        round: r.round,
        trackShort: r.trackShort,
        position: best.finishPosition,
        points: entries.reduce((sum, x) => sum + x.points, 0),
        grid: best.grid,
        dnf: entries.every((x) => x.status === "dnf"),
      });
    } else {
      const res = r.results.find((x) => x.driver === id);
      if (res) out.push({ round: r.round, trackShort: r.trackShort, position: res.finishPosition, points: res.points, grid: res.grid, dnf: res.status === "dnf" });
    }
  }
  return out;
}

export function recentResults(results: ResultPoint[], count = RECENT_FORM_WINDOW): ResultPoint[] {
  return results.slice(-count);
}

export function averageFinish(results: ResultPoint[]): number | null {
  if (results.length === 0) return null;
  return results.reduce((sum, r) => sum + r.position, 0) / results.length;
}

export function pointsPerRace(totalPoints: number, results: ResultPoint[]): number | null {
  if (results.length === 0) return null;
  return totalPoints / results.length;
}

export function dnfCount(results: ResultPoint[]): number {
  return results.filter((r) => r.dnf).length;
}

export function poleCount(raceSummaries: RaceSummary[], code: string): number {
  return completedRaces(raceSummaries).filter((r) => r.poleSitter === code).length;
}

export function bestResult(results: ResultPoint[]): ResultPoint | null {
  if (results.length === 0) return null;
  return results.reduce((best, r) => (r.position < best.position ? r : best));
}

/** The winning side's bar always reads full-length, the trailing side is drawn to scale against
 * it - shared by Compare's stat rows and the Battles list. */
export function tugPct(av: number, bv: number): [number, number] {
  if (av <= 0 && bv <= 0) return [0, 0];
  if (av >= bv) return [100, av === 0 ? 0 : Math.round((bv / av) * 100)];
  return [bv === 0 ? 0 : Math.round((av / bv) * 100), 100];
}

export type Battle = {
  type: EntityType;
  /** What aValue/bValue actually ARE. Every battle visualization must render this - a tug bar
   * with no stated metric is unreadable (is "6 vs 6" points, or head-to-head race wins?). */
  metric: "points";
  metricLabel: string;
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
      metric: "points",
      metricLabel: "Championship points",
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
      metric: "points",
      metricLabel: "Championship points",
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

/** `id` is what the AI layer's highlightedRecordIds validate against - without it the model had
 * no id space to reference and every highlight was silently discarded. `why` is the deterministic
 * one-line answer to "why does this matter", so Records reads as curated rather than a wall of
 * numbers. */
export type SeasonRecord = { id: string; label: string; name: string; value: string; why: string };

export function buildRecords(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[], raceSummaries: RaceSummary[]): SeasonRecord[] {
  const records: SeasonRecord[] = [];
  const completed = completedRaces(raceSummaries);

  const mostWins = [...drivers].sort((a, b) => b.wins - a.wins)[0];
  if (mostWins?.wins > 0) records.push({ id: "most-wins", label: "Most wins", name: mostWins.driverName, value: String(mostWins.wins), why: `${mostWins.wins} of ${completed.length} rounds won` });

  const mostPodiums = [...drivers].sort((a, b) => b.podiums - a.podiums)[0];
  if (mostPodiums?.podiums > 0) records.push({ id: "most-podiums", label: "Most podiums", name: mostPodiums.driverName, value: String(mostPodiums.podiums), why: `Top three in ${mostPodiums.podiums} of ${completed.length} rounds` });

  const poleCounts = new Map<string, number>();
  for (const r of completed) if (r.poleSitter) poleCounts.set(r.poleSitter, (poleCounts.get(r.poleSitter) ?? 0) + 1);
  const topPole = [...poleCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPole) {
    const d = drivers.find((x) => x.driver === topPole[0]);
    records.push({ id: "most-poles", label: "Most poles", name: d?.driverName ?? topPole[0], value: String(topPole[1]), why: "Fastest over one lap more often than anyone" });
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
    records.push({ id: "best-avg-finish", label: "Best avg finish", name: d?.driverName ?? bestAvg.code, value: `P${bestAvg.avg.toFixed(1)}`, why: "Most consistent finishing position in the field" });
  }

  const [leader, second] = drivers;
  if (leader && second) records.push({ id: "points-margin", label: "Points margin", name: `${leader.driverName} over ${second.driverName}`, value: String(leader.points - second.points), why: leader.points - second.points === 0 ? "The title fight is dead level" : "The gap the championship has to close" });

  const winners = new Set<string>();
  for (const r of completed) {
    const winner = r.results.find((x) => x.finishPosition === 1);
    if (winner) winners.add(winner.driverName);
  }
  if (winners.size > 0) records.push({ id: "race-winners", label: "Race winners", name: "Different drivers to win", value: String(winners.size), why: winners.size <= 2 ? "A season decided by very few hands" : "How widely victory has been shared" });

  const topTeam = constructors[0];
  if (topTeam) records.push({ id: "constructors-lead", label: "Constructors lead", name: topTeam.team, value: String(topTeam.points), why: "Leading the teams\u2019 championship" });

  // Streaks and single-round peaks - the records that describe FORM rather than season totals,
  // which is what stops this reading as the standings table restated in another shape.
  // computeStreaks already existed and was simply never wired into the records list.
  let bestStreak: { name: string; length: number } | null = null;
  for (const d of drivers) {
    const streak = computeStreaks(d.driver, raceSummaries, false);
    if (!bestStreak || streak.longestPointsStreak > bestStreak.length) bestStreak = { name: d.driverName, length: streak.longestPointsStreak };
  }
  if (bestStreak && bestStreak.length > 1) {
    records.push({
      id: "longest-points-streak",
      label: "Longest scoring run",
      name: bestStreak.name,
      value: String(bestStreak.length),
      why: `Scored in ${bestStreak.length} consecutive rounds`,
    });
  }

  let biggestHaul: { name: string; points: number; round: number } | null = null;
  let biggestComeback: { name: string; gained: number; round: number } | null = null;
  for (const r of completed) {
    for (const res of r.results) {
      if (!biggestHaul || res.points > biggestHaul.points) biggestHaul = { name: res.driverName, points: res.points, round: r.round };
      if (res.grid != null && res.status !== "dnf") {
        const gained = res.grid - res.finishPosition;
        if (gained > 0 && (!biggestComeback || gained > biggestComeback.gained)) biggestComeback = { name: res.driverName, gained, round: r.round };
      }
    }
  }
  if (biggestHaul && biggestHaul.points > 0) {
    records.push({
      id: "biggest-haul",
      label: "Biggest single round",
      name: biggestHaul.name,
      value: String(biggestHaul.points),
      why: `Most points taken from one round, at round ${biggestHaul.round}`,
    });
  }
  if (biggestComeback && biggestComeback.gained >= 3) {
    records.push({
      id: "biggest-comeback",
      label: "Best comeback",
      name: biggestComeback.name,
      value: `+${biggestComeback.gained}`,
      why: `Places gained from the grid in round ${biggestComeback.round}`,
    });
  }

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

  const completedRounds = completedRaces(raceSummaries);

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
  const completedRounds = completedRaces(raceSummaries);
  const windowSize = Math.min(RECENT_FORM_WINDOW, completedRounds.length);
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
  const completedRounds = completedRaces(raceSummaries);
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

// ─── Season snapshot ───────────────────────────────────────────────────────────
// Four deterministic reads of the season, each carrying its own REASON (why this is worth
// knowing) and its own TARGET (where clicking it should take you). Deliberately not generated by
// the LLM: these are facts plus a fixed editorial label, so they can never drift from the
// standings rendered directly underneath them, and they cost nothing to produce.

export type SnapshotTarget =
  | { kind: "standings"; entityType: EntityType; entityId: string }
  | { kind: "progression"; entityType: EntityType; entityId: string }
  | { kind: "battle"; entityType: EntityType; aId: string; bId: string };

export type SnapshotItem = {
  key: "leader" | "challenger" | "form" | "battle";
  label: string;
  name: string;
  /** The number that makes the claim - already formatted, because the unit differs per item. */
  value: string | null;
  /** The deterministic "so what". Never model-generated. */
  reason: string;
  target: SnapshotTarget | null;
  /** Entity ids this item is about, so the UI can mark it when one is a favorite. */
  entityIds: string[];
  entityType: EntityType;
};

/** Highest points total across the last RECENT_FORM_WINDOW completed rounds. Ties break toward
 * the better championship position, so the answer is stable rather than array-order dependent. */
export function bestRecentForm(
  drivers: DriverStandingRow[],
  raceSummaries: RaceSummary[],
): { driver: DriverStandingRow; points: number } | null {
  let best: { driver: DriverStandingRow; points: number } | null = null;
  for (const d of drivers) {
    const points = recentResults(entityResults(raceSummaries, d.driver, false)).reduce((sum, r) => sum + r.points, 0);
    if (!best || points > best.points) best = { driver: d, points };
  }
  return best;
}

export function buildSeasonSnapshot(drivers: DriverStandingRow[], raceSummaries: RaceSummary[], battles: Battle[]): SnapshotItem[] {
  const rounds = completedRoundCount(raceSummaries);
  const leader = drivers[0];
  const challenger = drivers[1];
  const form = bestRecentForm(drivers, raceSummaries);
  const tightest = battles[0];
  const items: SnapshotItem[] = [];

  if (leader) {
    const gap = challenger ? leader.points - challenger.points : 0;
    items.push({
      key: "leader",
      label: "Leader",
      name: leader.driverName,
      value: `${leader.points} pts${leader.wins > 0 ? ` · ${leader.wins} win${leader.wins === 1 ? "" : "s"}` : ""}`,
      // The reason is a real read of the gap, not a fixed platitude - a 6-point lead and a
      // 70-point lead are not the same championship.
      reason: !challenger ? "Sets the pace" : gap === 0 ? "Level at the top" : gap > 50 ? "Controls the championship" : gap > 20 ? "Holds the advantage" : "Leads, but narrowly",
      target: { kind: "standings", entityType: "drivers", entityId: leader.driver },
      entityIds: [leader.driver],
      entityType: "drivers",
    });
  }

  if (challenger && leader) {
    const gap = leader.points - challenger.points;
    items.push({
      key: "challenger",
      label: "Challenger",
      name: challenger.driverName,
      value: gap === 0 ? "Level on points" : `${gap} pts behind`,
      reason: gap === 0 ? "Level with the leader" : "Largest realistic threat",
      target: { kind: "standings", entityType: "drivers", entityId: challenger.driver },
      entityIds: [challenger.driver],
      entityType: "drivers",
    });
  }

  if (form && rounds > 0) {
    const window = Math.min(RECENT_FORM_WINDOW, rounds);
    items.push({
      key: "form",
      label: "Best form",
      name: form.driver.driverName,
      value: `${form.points} pts in last ${window}`,
      reason: leader && form.driver.driver === leader.driver ? "The leader is also the form driver" : "Strongest recent momentum",
      target: { kind: "progression", entityType: "drivers", entityId: form.driver.driver },
      entityIds: [form.driver.driver],
      entityType: "drivers",
    });
  }

  if (tightest) {
    items.push({
      key: "battle",
      label: "Tightest battle",
      name: `${tightest.aLabel} ↔ ${tightest.bLabel}`,
      value: tightest.gap === 0 ? "Level on points" : `${tightest.gap} pt gap`,
      reason: "Closest active rivalry",
      target: { kind: "battle", entityType: tightest.type, aId: tightest.aId, bId: tightest.bId },
      entityIds: [tightest.aId, tightest.bId],
      entityType: tightest.type,
    });
  }

  return items;
}

// ─── Compare pair ──────────────────────────────────────────────────────────────
// THE deterministic comparison between exactly two entities. Built once, server-side, and used
// for three things at once: what Compare renders, what the LLM is given as its ONLY factual
// input, and what the compare cache key hashes. One source, so the selection, the numbers, and
// the narrative physically cannot disagree.

export type ComparePairSide = {
  id: string;
  name: string;
  team: string | null;
  points: number;
  wins: number;
  podiums: number;
  poles: number | null;
  scoredRounds: number;
  pointsPerRace: number | null;
  averageFinish: number | null;
  bestFinish: number | null;
  dnfs: number;
  recentPoints: number;
  recentAverageFinish: number | null;
};

export type ComparePair = {
  season: number;
  entityType: EntityType;
  completedRounds: number;
  a: ComparePairSide;
  b: ComparePairSide;
  pointsGap: number;
  /** id of whoever leads on points, or null when level. */
  aheadId: string | null;
  /** Head-to-head is RACE CLASSIFICATION, a different metric from championship points - carried
   * separately and always labelled as such, never merged into the points comparison. */
  h2h: H2HResult;
  /** Deterministic, from points scored across the last RECENT_FORM_WINDOW rounds. The model is
   * told this value; it must never compute one of its own. */
  momentum: "A" | "B" | "EVEN";
  momentumWindow: number;
  raceByRace: { round: number; trackShort: string; aPos: number | null; bPos: number | null }[];
};

function compareSide(
  id: string,
  name: string,
  team: string | null,
  points: number,
  wins: number,
  podiums: number,
  raceSummaries: RaceSummary[],
  isConstructors: boolean,
): ComparePairSide {
  const results = entityResults(raceSummaries, id, isConstructors);
  const recent = recentResults(results);
  const best = bestResult(results);
  return {
    id,
    name,
    team,
    points,
    wins,
    podiums,
    poles: isConstructors ? null : poleCount(raceSummaries, id),
    scoredRounds: results.length,
    pointsPerRace: pointsPerRace(points, results),
    averageFinish: averageFinish(results),
    bestFinish: best ? best.position : null,
    dnfs: dnfCount(results),
    recentPoints: recent.reduce((sum, r) => sum + r.points, 0),
    recentAverageFinish: averageFinish(recent),
  };
}

export function buildComparePair(
  season: number,
  entityType: EntityType,
  entityAId: string,
  entityBId: string,
  drivers: DriverStandingRow[],
  constructors: ConstructorStandingRow[],
  raceSummaries: RaceSummary[],
): ComparePair | null {
  if (!entityAId || !entityBId || entityAId === entityBId) return null;
  const isConstructors = entityType === "constructors";

  let a: ComparePairSide;
  let b: ComparePairSide;
  if (isConstructors) {
    const ra = constructors.find((c) => c.team === entityAId);
    const rb = constructors.find((c) => c.team === entityBId);
    if (!ra || !rb) return null;
    a = compareSide(ra.team, ra.team, null, ra.points, ra.wins, ra.podiums, raceSummaries, true);
    b = compareSide(rb.team, rb.team, null, rb.points, rb.wins, rb.podiums, raceSummaries, true);
  } else {
    const ra = drivers.find((d) => d.driver === entityAId);
    const rb = drivers.find((d) => d.driver === entityBId);
    if (!ra || !rb) return null;
    a = compareSide(ra.driver, ra.driverName, ra.team, ra.points, ra.wins, ra.podiums, raceSummaries, false);
    b = compareSide(rb.driver, rb.driverName, rb.team, rb.points, rb.wins, rb.podiums, raceSummaries, false);
  }

  const isTeammates = !isConstructors && a.team !== null && a.team === b.team;
  const h2h = computeHeadToHead(entityAId, entityBId, raceSummaries, isConstructors, isTeammates);

  const resultsA = entityResults(raceSummaries, entityAId, isConstructors);
  const resultsB = entityResults(raceSummaries, entityBId, isConstructors);
  const rounds = [...new Set([...resultsA.map((r) => r.round), ...resultsB.map((r) => r.round)])].sort((x, y) => x - y);
  const raceByRace = rounds.map((round) => {
    const ra = resultsA.find((r) => r.round === round);
    const rb = resultsB.find((r) => r.round === round);
    return { round, trackShort: ra?.trackShort ?? rb?.trackShort ?? "", aPos: ra?.position ?? null, bPos: rb?.position ?? null };
  });

  return {
    season,
    entityType,
    completedRounds: completedRoundCount(raceSummaries),
    a,
    b,
    pointsGap: Math.abs(a.points - b.points),
    aheadId: a.points === b.points ? null : a.points > b.points ? a.id : b.id,
    h2h,
    momentum: a.recentPoints === b.recentPoints ? "EVEN" : a.recentPoints > b.recentPoints ? "A" : "B",
    momentumWindow: Math.min(RECENT_FORM_WINDOW, completedRoundCount(raceSummaries)),
    raceByRace,
  };
}

// ─── Personal season context ───────────────────────────────────────────────────
// Personalization as a DETERMINISTIC OVERLAY on shared intelligence: favorites change which rows
// are marked, which changes sort first, and add one extra "For you" line - they never trigger a
// second LLM generation, and they never touch the shared season cache key.

export type PersonalHighlight = {
  entityType: EntityType;
  entityId: string;
  name: string;
  line: string;
};

export type PersonalSeasonContext = {
  hasFavorites: boolean;
  /** Favorited entities in THIS page's code space (driver code / team name), not archive-id space. */
  driverCodes: string[];
  teamNames: string[];
  /** One deterministic sentence, the "For you" companion to the shared Apex take. Null when
   * there's nothing real to say - never filler. */
  companion: string | null;
  highlights: PersonalHighlight[];
};

const EMPTY_PERSONAL: PersonalSeasonContext = { hasFavorites: false, driverCodes: [], teamNames: [], companion: null, highlights: [] };

export function buildPersonalSeasonContext(
  favoriteDriverIds: string[],
  favoriteTeamIds: string[],
  drivers: DriverStandingRow[],
  constructors: ConstructorStandingRow[],
  raceSummaries: RaceSummary[],
  progression: Record<string, number | string | null>[],
): PersonalSeasonContext {
  const favDriverSet = new Set(favoriteDriverIds);
  const favTeamSet = new Set(favoriteTeamIds);
  const favDrivers = drivers.filter((d) => d.favoriteId && favDriverSet.has(d.favoriteId));
  const favTeams = constructors.filter((c) => favTeamSet.has(c.favoriteId));
  if (favDrivers.length === 0 && favTeams.length === 0) return EMPTY_PERSONAL;

  const changes = computePositionChanges(drivers, constructors, progression);
  const rounds = completedRoundCount(raceSummaries);
  const window = Math.min(RECENT_FORM_WINDOW, rounds);
  const highlights: PersonalHighlight[] = [];

  for (const d of favDrivers) {
    const position = drivers.indexOf(d) + 1;
    const change = changes.drivers.find((c) => c.entityId === d.driver);
    const recent = recentResults(entityResults(raceSummaries, d.driver, false)).reduce((sum, r) => sum + r.points, 0);
    const parts = [`P${position} on ${d.points} pts`];
    if (change?.positionDelta) parts.push(`${change.positionDelta > 0 ? "up" : "down"} ${Math.abs(change.positionDelta)} since the previous round`);
    else if (change?.pointsDelta) parts.push(`+${change.pointsDelta} pts in the latest round`);
    if (window > 0) parts.push(`${recent} pts in the last ${window}`);
    highlights.push({ entityType: "drivers", entityId: d.driver, name: d.driverName, line: parts.join(" · ") });
  }

  for (const c of favTeams) {
    const position = constructors.indexOf(c) + 1;
    const change = changes.constructors.find((x) => x.entityId === c.team);
    const parts = [`P${position} on ${c.points} pts`];
    if (change?.positionDelta) parts.push(`${change.positionDelta > 0 ? "up" : "down"} ${Math.abs(change.positionDelta)} since the previous round`);
    else if (change?.pointsDelta) parts.push(`+${change.pointsDelta} pts in the latest round`);
    highlights.push({ entityType: "constructors", entityId: c.team, name: c.team, line: parts.join(" · ") });
  }

  // The companion sentence leads with the most newsworthy real fact about a favorite: a position
  // move first, then points gained, then standing. Never invents a storyline when there isn't one.
  let companion: string | null = null;
  const primary = favDrivers[0];
  if (primary) {
    const position = drivers.indexOf(primary) + 1;
    const change = changes.drivers.find((c) => c.entityId === primary.driver);
    const recent = recentResults(entityResults(raceSummaries, primary.driver, false)).reduce((sum, r) => sum + r.points, 0);
    const form = bestRecentForm(drivers, raceSummaries);
    const isFormLeader = !!form && form.driver.driver === primary.driver;
    if (change?.positionDelta) {
      companion = `${primary.driverName} moved ${change.positionDelta > 0 ? "up" : "down"} ${Math.abs(change.positionDelta)} place${Math.abs(change.positionDelta) === 1 ? "" : "s"} to P${position} after the latest completed round${change.pointsDelta ? `, scoring ${change.pointsDelta} points` : ""}.`;
    } else if (change?.pointsDelta) {
      companion = `${primary.driverName} scored ${change.pointsDelta} point${change.pointsDelta === 1 ? "" : "s"} in the latest completed round and holds P${position}.`;
    } else if (window > 0) {
      companion = `${primary.driverName} sits P${position} on ${primary.points} points, with ${recent} scored across the last ${window} rounds.`;
    } else {
      companion = `${primary.driverName} sits P${position} on ${primary.points} points.`;
    }
    if (isFormLeader && window > 0) companion += " That's the strongest recent scoring run in the field.";
  } else if (favTeams[0]) {
    const team = favTeams[0];
    const position = constructors.indexOf(team) + 1;
    companion = `${team.team} sits P${position} in the constructors' championship on ${team.points} points.`;
  }

  return {
    hasFavorites: true,
    driverCodes: favDrivers.map((d) => d.driver),
    teamNames: favTeams.map((c) => c.team),
    companion,
    highlights,
  };
}

// ─── Prediction review ─────────────────────────────────────────────────────────
// Accuracy is COMPUTED, never narrated. The model may interpret a result, but it must not be the
// thing that decides whether a prediction was right - that has to be checkable, and a sentence
// isn't. The race window renders these verdicts directly and the prompt is explicitly forbidden
// from scoring anything itself.

export type PredictionVerdict = "correct" | "partial" | "missed";

export type PredictionReviewLine = {
  label: string;
  predicted: string;
  actual: string;
  verdict: PredictionVerdict;
  /** "2 of 3 correct" for the podium row - null where a count would be meaningless. */
  detail: string | null;
};

export type PredictionReview = {
  source: "simulation" | "model";
  lines: PredictionReviewLine[];
};

/** Null unless the round is genuinely complete AND a pre-race prediction was actually frozen for
 * it. A round the model never ran on produces no review rather than an empty scorecard. */
export function buildPredictionReview(race: RaceSummary): PredictionReview | null {
  if (race.weekendStatus !== "completed" || !race.predicted) return null;
  const nameOf = (code: string | null): string => (code ? race.results.find((r) => r.driver === code)?.driverName ?? code : "—");

  const lines: PredictionReviewLine[] = [];
  const actualWinner = race.results.find((r) => r.finishPosition === 1)?.driver ?? null;

  if (race.predicted.winner && actualWinner) {
    lines.push({
      label: "Winner",
      predicted: nameOf(race.predicted.winner),
      actual: nameOf(actualWinner),
      verdict: race.predicted.winner === actualWinner ? "correct" : "missed",
      detail: null,
    });
  }

  if (race.predicted.pole && race.poleSitter) {
    lines.push({
      label: "Pole",
      predicted: nameOf(race.predicted.pole),
      actual: nameOf(race.poleSitter),
      verdict: race.predicted.pole === race.poleSitter ? "correct" : "missed",
      detail: null,
    });
  }

  const actualPodium = race.podium.map((p) => p.driver);
  if (race.predicted.podium.length === 3 && actualPodium.length === 3) {
    // Credit for naming the right three, regardless of order - the prediction is a podium, not a
    // finishing order, and scoring it as an exact sequence would understate it.
    const hits = race.predicted.podium.filter((d) => actualPodium.includes(d)).length;
    lines.push({
      label: "Podium",
      predicted: race.predicted.podium.map(nameOf).join(", "),
      actual: race.podium.map((p) => p.driverName).join(", "),
      verdict: hits === 3 ? "correct" : hits > 0 ? "partial" : "missed",
      detail: `${hits} of 3 correct`,
    });
  }

  return lines.length > 0 ? { source: race.predicted.source, lines } : null;
}

/** Practice / qualifying / sprint / race, from the short session code. One classification shared
 * by the calendar heatmap and the weekend timeline, so a session is never the "practice" colour in
 * one place and something else in the other. */
export type SessionKind = "practice" | "qualifying" | "sprint" | "race";

export function sessionKind(code: string): SessionKind {
  if (code === "R") return "race";
  if (code.startsWith("S")) return "sprint";
  if (code === "Q") return "qualifying";
  return "practice";
}
