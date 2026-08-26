// Small, shared per-driver/per-team derivations over RaceSummary[] — used by both the standings
// table's row-expansion panel and the Compare workspace, so "recent form"/"avg finish"/etc. mean
// exactly the same thing in both places instead of two slightly-different reimplementations.

import type { RaceSummary } from "../services/season.service";

export type ResultPoint = { round: number; trackShort: string; position: number; points: number; grid: number | null; dnf: boolean };

export function driverResults(raceSummaries: RaceSummary[], code: string): ResultPoint[] {
  const points: ResultPoint[] = [];
  for (const r of raceSummaries) {
    if (r.state !== "completed") continue;
    const res = r.results.find((x) => x.driver === code);
    if (res) points.push({ round: r.round, trackShort: r.trackShort, position: res.finishPosition, points: res.points, grid: res.grid, dnf: res.status === "dnf" });
  }
  return points;
}

// A team's result each race is whichever of its drivers finished higher that weekend — same
// convention season.service.ts's old teamBestPositions used.
export function teamResults(raceSummaries: RaceSummary[], team: string): ResultPoint[] {
  const points: ResultPoint[] = [];
  for (const r of raceSummaries) {
    if (r.state !== "completed") continue;
    const teamEntries = r.results.filter((x) => x.team === team);
    if (teamEntries.length === 0) continue;
    const best = teamEntries.reduce((a, b) => (a.finishPosition < b.finishPosition ? a : b));
    const teamPoints = teamEntries.reduce((sum, x) => sum + x.points, 0);
    points.push({ round: r.round, trackShort: r.trackShort, position: best.finishPosition, points: teamPoints, grid: best.grid, dnf: teamEntries.every((x) => x.status === "dnf") });
  }
  return points;
}

export function recentForm(results: ResultPoint[], count = 5): ResultPoint[] {
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
  return raceSummaries.filter((r) => r.poleSitter === code).length;
}

export function bestResult(results: ResultPoint[]): ResultPoint | null {
  if (results.length === 0) return null;
  return results.reduce((best, r) => (r.position < best.position ? r : best));
}
