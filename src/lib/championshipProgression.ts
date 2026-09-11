// A pure, dependency-free module - same reason sessionCode.ts/groupPredictionTypes.ts exist on
// their own (see either file's own comment). computeChampionshipProgression used to live in
// personalization.ts, which imports lib/supabase/archive.ts -> supabaseAdmin - fine for every
// existing server-only caller, but the instant a "use client" component (ChampionshipTrajectory)
// imported this one function from that module, the whole chain (including supabaseAdmin's eager
// SUPABASE_SECRET_KEY check) got pulled into the client bundle and crashed it at module
// evaluation. Confirmed live: `next dev` threw exactly this on the homepage the first time
// ChampionshipTrajectory imported computeChampionshipProgression straight from personalization.ts.

import { trackShortForm } from "@/lib/format";
import type { RaceDoc } from "@/lib/types/race";

/** Cumulative points per round for a fixed set of drivers - the "curve" half of the homepage's
 * randomized table-vs-chart fact presentation (computeSeasonStandings is the table/bar half). One
 * flat object per completed round (`{round, raceName, trackShort, HAM: 45, VER: 60, ...}`) since
 * that's the shape recharts' own multi-<Line>/<Area> convention wants (season.service.ts's own
 * usage) - each driver code becomes its own dataKey; trackShort is what the x-axis actually labels
 * each tick with (a full event name doesn't fit that many ticks legibly), raceName is kept for
 * anything that wants the full name (a tooltip, an export).
 *
 * Per-round finish position is captured alongside the cumulative points, keyed `${code}__finishPosition`
 * to avoid colliding with a driver-code key - additive only, `season.service.ts`/`ProgressionPanel.tsx`
 * (the other consumer, via personalization.ts's re-export) only ever read `row[specificCode]`/
 * `row.round`/`row.raceName`/`row.trackShort` and never enumerate keys, so this is safe for them. */
export function computeChampionshipProgression(races: RaceDoc[], driverCodes: string[]): Record<string, number | string | null>[] {
  const completed = races.filter((r) => r.status === "completed").sort((a, b) => a.round - b.round);

  const running: Record<string, number> = {};
  for (const code of driverCodes) running[code] = 0;

  return completed.map((race) => {
    for (const r of race.results ?? []) {
      if (r.driver in running) running[r.driver] += r.points;
    }
    const positions: Record<string, number | null> = {};
    for (const code of driverCodes) {
      positions[`${code}__finishPosition`] = race.results?.find((r) => r.driver === code)?.finishPosition ?? null;
    }
    return {
      round: race.round,
      raceName: race.name ?? `Round ${race.round}`,
      trackShort: trackShortForm(race.circuit),
      ...running,
      ...positions,
    };
  });
}

/** Same shape/logic as computeChampionshipProgression, grouped by `race.results[].team` instead of
 * `.driver` - lets ChampionshipTrajectory.tsx plot a real constructor points trajectory unmodified
 * (it only ever reads `row[seriesCode]`, never cares whether that code is a driver code or a team
 * name). No per-round finish position here - that's a per-driver concept, and the chart's tooltip
 * already treats a missing `${code}__finishPosition` as "nothing to show", not an error. */
export function computeConstructorChampionshipProgression(races: RaceDoc[], teamNames: string[]): Record<string, number | string | null>[] {
  const completed = races.filter((r) => r.status === "completed").sort((a, b) => a.round - b.round);

  const running: Record<string, number> = {};
  for (const name of teamNames) running[name] = 0;

  return completed.map((race) => {
    for (const r of race.results ?? []) {
      if (r.team in running) running[r.team] += r.points;
    }
    return {
      round: race.round,
      raceName: race.name ?? `Round ${race.round}`,
      trackShort: trackShortForm(race.circuit),
      ...running,
    };
  });
}
