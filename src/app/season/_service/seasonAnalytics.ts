// Deterministic season analytics.
//
// These exist because Apex's prebuilt questions were failing in a specific, avoidable way: asked
// "when did the championship start to turn?", it answered "I don't have the specific race-by-race
// timeline on this page" - and it was telling the truth. The grounding context carried current
// standings, battles and records, but nothing about how the season got there, so a question about
// change over time had no material to work from.
//
// The fix is not "send more raw data". A 23-round x 20-driver points matrix is both too large for
// a prompt and the wrong shape for the question. Instead the analysis itself is computed here, in
// full, from real data - and the model is handed the CONCLUSION plus the numbers behind it to
// narrate. That makes the answers checkable, cheap, and impossible to hallucinate.

import {
  completedRaces,
  entityResults,
  recentResults,
  type ConstructorStandingRow,
  type DriverStandingRow,
  type RaceSummary,
} from "./season.pure";

type ProgressionRow = Record<string, number | string | null>;

/** Cumulative points for one entity at one round, read out of the progression matrix. */
function pointsAt(row: ProgressionRow, id: string): number {
  const v = row[id];
  return typeof v === "number" ? v : 0;
}

export type TimelinePoint = {
  round: number;
  raceName: string;
  /** Who led the championship after this round, and by how much. */
  leader: string;
  leaderPoints: number;
  second: string | null;
  secondPoints: number | null;
  gap: number | null;
  winner: string | null;
};

/** The championship's shape, round by round: who was ahead after each completed round and by how
 * much. This is the series every "how did we get here" question needs, and it is small - one row
 * per round rather than one row per driver per round. */
export function buildSeasonTimeline(
  drivers: DriverStandingRow[],
  raceSummaries: RaceSummary[],
  progression: ProgressionRow[],
): TimelinePoint[] {
  const completed = completedRaces(raceSummaries);
  const winnerByRound = new Map(completed.map((r) => [r.round, r.winnerName]));
  const nameByCode = new Map(drivers.map((d) => [d.driver, d.driverName]));

  const out: TimelinePoint[] = [];
  for (const row of progression) {
    const round = typeof row.round === "number" ? row.round : null;
    if (round === null) continue;

    // Rank every driver by cumulative points AT THIS ROUND - not by their final position, which
    // would make the whole timeline read as though the current order always held.
    const ranked = drivers
      .map((d) => ({ code: d.driver, points: pointsAt(row, d.driver) }))
      .filter((d) => d.points > 0)
      .sort((a, b) => b.points - a.points);
    if (ranked.length === 0) continue;

    const leader = ranked[0];
    const second = ranked[1] ?? null;
    out.push({
      round,
      raceName: typeof row.raceName === "string" ? row.raceName : `Round ${round}`,
      leader: nameByCode.get(leader.code) ?? leader.code,
      leaderPoints: leader.points,
      second: second ? nameByCode.get(second.code) ?? second.code : null,
      secondPoints: second ? second.points : null,
      gap: second ? leader.points - second.points : null,
      winner: winnerByRound.get(round) ?? null,
    });
  }
  return out;
}

export type MomentumShift = {
  round: number;
  raceName: string;
  /** The championship gap immediately before and after the swing. */
  gapBefore: number;
  gapAfter: number;
  swing: number;
  leaderBefore: string;
  leaderAfter: string;
  /** True when the swing actually changed who was leading - the strongest kind of turning point. */
  leadChanged: boolean;
  /** Rounds either side, so the narrative can describe the run rather than a single race. */
  window: TimelinePoint[];
};

/** The clearest inflection in the championship: the round where the gap at the top moved most.
 *
 * A lead CHANGING hands outranks any pure gap swing, because that is unambiguously the moment the
 * championship turned. Failing that, the largest single-round change in the leader's advantage is
 * the honest answer. Returns null when there simply isn't enough season yet to have a turning
 * point - which is a real answer, not a failure. */
export function findMomentumShift(timeline: TimelinePoint[]): MomentumShift | null {
  if (timeline.length < 3) return null;

  let best: MomentumShift | null = null;
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1];
    const curr = timeline[i];
    if (prev.gap === null || curr.gap === null) continue;

    const leadChanged = prev.leader !== curr.leader;
    const swing = leadChanged ? prev.gap + curr.gap : Math.abs(curr.gap - prev.gap);

    // A lead change always beats a non-lead-change, regardless of raw magnitude.
    const beatsBest =
      !best || (leadChanged && !best.leadChanged) || (leadChanged === best.leadChanged && swing > best.swing);
    if (!beatsBest) continue;

    best = {
      round: curr.round,
      raceName: curr.raceName,
      gapBefore: prev.gap,
      gapAfter: curr.gap,
      swing,
      leaderBefore: prev.leader,
      leaderAfter: curr.leader,
      leadChanged,
      window: timeline.slice(Math.max(0, i - 2), Math.min(timeline.length, i + 2)),
    };
  }
  return best;
}

export type MomentumEntry = { name: string; last3: number; last5: number; total: number };

/** Points scored across the most recent rounds - the answer to "who has momentum". Sorted by the
 * 5-round window, with the 3-round window carried alongside so a very recent surge is visible. */
export function computeMomentum(drivers: DriverStandingRow[], raceSummaries: RaceSummary[]): MomentumEntry[] {
  return drivers
    .map((d) => {
      const results = entityResults(raceSummaries, d.driver, false);
      const sum = (n: number) => recentResults(results, n).reduce((acc, r) => acc + r.points, 0);
      return { name: d.driverName, last3: sum(3), last5: sum(5), total: d.points };
    })
    .sort((a, b) => b.last5 - a.last5 || b.last3 - a.last3);
}

export type TeamTrend = {
  team: string;
  earlyAvgPoints: number;
  recentAvgPoints: number;
  delta: number;
};

/** Which teams are actually getting better or worse: average points per round across the first
 * half of the completed season versus the most recent third. Teams with too few rounds either
 * side are excluded rather than compared on noise. */
export function computeTeamTrends(constructors: ConstructorStandingRow[], raceSummaries: RaceSummary[]): TeamTrend[] {
  const completed = completedRaces(raceSummaries);
  if (completed.length < 4) return [];

  const splitAt = Math.floor(completed.length / 2);
  const recentFrom = Math.max(splitAt, completed.length - Math.max(3, Math.floor(completed.length / 3)));

  const trends: TeamTrend[] = [];
  for (const c of constructors) {
    const results = entityResults(raceSummaries, c.team, true);
    const early = results.filter((r) => r.round <= completed[splitAt - 1]?.round);
    const recent = results.filter((r) => r.round >= completed[recentFrom]?.round);
    if (early.length === 0 || recent.length === 0) continue;

    const earlyAvg = early.reduce((s, r) => s + r.points, 0) / early.length;
    const recentAvg = recent.reduce((s, r) => s + r.points, 0) / recent.length;
    trends.push({
      team: c.team,
      earlyAvgPoints: Number(earlyAvg.toFixed(1)),
      recentAvgPoints: Number(recentAvg.toFixed(1)),
      delta: Number((recentAvg - earlyAvg).toFixed(1)),
    });
  }
  return trends.sort((a, b) => b.delta - a.delta);
}

/** Per-round points for one entity across the recent window - the series the What Changed
 * sparklines draw, and the same numbers a "last 5 rounds" answer quotes. One source for both, so
 * the chart and the sentence can never disagree. */
export function recentPointsSeries(
  entityId: string,
  raceSummaries: RaceSummary[],
  isConstructors: boolean,
  count = 6,
): { round: number; points: number; cumulative: number }[] {
  const all = entityResults(raceSummaries, entityId, isConstructors);
  const window = all.slice(-count);
  // Cumulative is measured from the start of the season, not the start of the window - a rising
  // line has to mean "gaining points overall", not "the window happens to start at zero".
  let running = all.slice(0, Math.max(0, all.length - window.length)).reduce((s, r) => s + r.points, 0);
  return window.map((r) => {
    running += r.points;
    return { round: r.round, points: r.points, cumulative: running };
  });
}

// ─── Race quick insights ───────────────────────────────────────────────────────

export type RaceInsight = { text: string; tone: "neutral" | "positive" | "warning" };

/** Three short, concrete observations about one round.
 *
 * Deliberately deterministic rather than a second model call: everything worth saying here is
 * already computable (who converted pole, who gained most, how many retired, what the forecast
 * risk is), and computing it means the bullets can never contradict the result printed beside
 * them. They also cost nothing and need no loading state.
 *
 * Returns fewer than three - or none - rather than padding with filler when a round genuinely
 * hasn't produced anything to say. */
export function buildRaceInsights(race: RaceSummary, drivers: DriverStandingRow[]): RaceInsight[] {
  const out: RaceInsight[] = [];

  if (race.weekendStatus === "cancelled" || race.weekendStatus === "postponed") {
    return [{ text: `This round is currently marked ${race.weekendStatus}.`, tone: "warning" }];
  }

  if (race.weekendStatus === "completed") {
    const winner = race.results.find((r) => r.finishPosition === 1);
    if (winner) {
      if (race.poleSitter && race.poleSitter === winner.driver) {
        out.push({ text: `${winner.driverName} converted pole into the win.`, tone: "positive" });
      } else if (winner.grid != null && winner.grid > 1) {
        const gained = winner.grid - 1;
        out.push({ text: `${winner.driverName} won from P${winner.grid}, making up ${gained} place${gained === 1 ? "" : "s"}.`, tone: "positive" });
      } else {
        out.push({ text: `${winner.driverName} took the win.`, tone: "positive" });
      }
    }

    // Biggest gain from the grid - the race's real story more often than the winner is.
    const movers = race.results
      .filter((r) => r.grid != null && r.status !== "dnf")
      .map((r) => ({ name: r.driverName, gained: (r.grid as number) - r.finishPosition }))
      .sort((a, b) => b.gained - a.gained);
    if (movers[0] && movers[0].gained > 2 && movers[0].name !== race.winnerName) {
      out.push({ text: `${movers[0].name} gained ${movers[0].gained} places from the grid.`, tone: "positive" });
    }

    const dnfs = race.results.filter((r) => r.status === "dnf").length;
    if (dnfs > 0) out.push({ text: `${dnfs} car${dnfs === 1 ? "" : "s"} failed to finish.`, tone: "warning" });

    // Pole-sitter losing out is worth a line when it isn't already implied above.
    if (race.poleSitterName && race.winnerName && race.poleSitterName !== race.winnerName) {
      const poleResult = race.results.find((r) => r.driver === race.poleSitter);
      if (poleResult && poleResult.finishPosition > 3) {
        out.push({ text: `${race.poleSitterName} started from pole but finished P${poleResult.finishPosition}.`, tone: "warning" });
      }
    }
    return out.slice(0, 3);
  }

  // Upcoming or live: context and risk only, never a predicted outcome dressed as fact.
  const leader = drivers[0];
  const second = drivers[1];
  if (leader && second) {
    const gap = leader.points - second.points;
    out.push({
      text: gap === 0
        ? `${leader.driverName} and ${second.driverName} arrive level on points.`
        : `${leader.driverName} leads ${second.driverName} by ${gap} point${gap === 1 ? "" : "s"} coming in.`,
      tone: "neutral",
    });
  }

  if (race.forecast) {
    const rain = Math.round(race.forecast.rainProbability * 100);
    if (rain >= 40) out.push({ text: `Rain probability is ${rain}%, enough to put strategy in play.`, tone: "warning" });
    else if (race.forecast.airTempC >= 28) out.push({ text: `Air temperature near ${Math.round(race.forecast.airTempC)}C should stress tyre degradation.`, tone: "warning" });
    else out.push({ text: `Conditions look settled, with a ${rain}% chance of rain.`, tone: "neutral" });
  }

  if (race.isSprintWeekend) {
    out.push({ text: "Sprint format puts points on offer twice this weekend.", tone: "neutral" });
  } else if (race.weekendStatus === "live") {
    const next = race.sessions.find((s) => s.state === "current" || s.state === "upcoming");
    if (next) out.push({ text: `${next.label} is the next session to run.`, tone: "neutral" });
  }

  return out.slice(0, 3);
}
