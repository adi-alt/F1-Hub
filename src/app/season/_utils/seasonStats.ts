// Thin re-export shim over season.pure.ts.
//
// These derivations (a driver's/team's per-round results, average finish, points-per-race, DNFs,
// poles, the tug-of-war bar split) used to be DEFINED here, separately from the equivalents the
// server-side season builders used - two implementations of "what counts as a completed round"
// and "what is a team's result for a weekend", which is exactly how two components end up
// disagreeing about the same season. They now live in one place (season.pure.ts, next to
// completedRaces/completedRoundCount, which the whole page shares); this file stays only so the
// existing `../_utils/seasonStats` import sites keep reading naturally.

export {
  entityResults,
  recentResults as recentForm,
  averageFinish,
  pointsPerRace,
  dnfCount,
  poleCount,
  bestResult,
  tugPct,
} from "../_service/season.pure";
export type { ResultPoint } from "../_service/season.pure";

import { entityResults, type ResultPoint, type RaceSummary } from "../_service/season.pure";

export function driverResults(raceSummaries: RaceSummary[], code: string): ResultPoint[] {
  return entityResults(raceSummaries, code, false);
}

export function teamResults(raceSummaries: RaceSummary[], team: string): ResultPoint[] {
  return entityResults(raceSummaries, team, true);
}
