import type { EntityType, RaceSummary } from "../_service/season.pure";

/**
 * The championship, round by round, derived only from each completed round's own classification
 * (RaceSummary.results[].points): never final standings repeated across rounds. It uses the same source
 * as the standings table (computeStandings sums the same race results), so the two always agree.
 *
 * Known limitation, surfaced on the page: the app's points are Grand Prix points only. The pipeline does not
 * fetch sprint sessions and there is no sprint results table, so on sprint weekends the standings and this
 * progression are lower than the official championship. Adding sprints needs a table, the pipeline and a
 * backfill, then every standings consumer (lib/standings.ts and its callers) changed together.
 */

/** The most one driver can score in a Grand Prix: 25 for the win, plus the fastest-lap point in 2019-2024 (it was
 * dropped from 2025). Sprints are not counted: the app has no sprint results (see the file comment). */
export function pointsPerRaceMax(year: number): number {
  return year >= 2019 && year <= 2024 ? 26 : 25;
}

export type Round = { round: number; name: string; trackShort: string; completed: boolean; cancelled: boolean };
export type Series = { id: string; label: string; team: string; points: (number | null)[] };

/** One entry per scheduled round; `points` is the running total after that round, null for rounds not yet run. */
export function buildProgression(races: RaceSummary[], entity: EntityType): { rounds: Round[]; series: Series[] } {
  const ordered = [...races].sort((a, b) => a.round - b.round);
  const rounds: Round[] = ordered.map((r) => ({ round: r.round, name: r.name, trackShort: r.trackShort, completed: r.state === "completed", cancelled: r.weekendStatus === "cancelled" }));
  const totals = new Map<string, number>();
  const meta = new Map<string, { label: string; team: string }>();
  const byRound: Map<string, number>[] = [];
  for (const r of ordered) {
    if (r.state !== "completed") {
      byRound.push(new Map());
      continue;
    }
    for (const res of r.results) {
      const id = entity === "drivers" ? res.driver : res.team;
      meta.set(id, { label: entity === "drivers" ? res.driverName : res.team, team: res.team });
      totals.set(id, (totals.get(id) ?? 0) + res.points);
    }
    byRound.push(new Map(totals));
  }
  const series: Series[] = [...meta.entries()].map(([id, m]) => ({
    id,
    label: m.label,
    team: m.team,
    points: rounds.map((round, i) => (round.completed ? (byRound[i].get(id) ?? 0) : null)),
  }));
  series.sort((a, b) => lastValue(b) - lastValue(a));
  return { rounds, series };
}

export function lastValue(s: Series): number {
  for (let i = s.points.length - 1; i >= 0; i--) if (s.points[i] !== null) return s.points[i]!;
  return 0;
}

/** Index of the last completed round in `rounds`, or -1. */
export function lastCompletedIndex(rounds: Round[]): number {
  for (let i = rounds.length - 1; i >= 0; i--) if (rounds[i].completed) return i;
  return -1;
}

/** Championship position (1-based) of every series after round index `i`, ties broken by id for stability. */
export function ranksAfter(series: Series[], i: number): Map<string, number> {
  const sorted = [...series].sort((a, b) => (b.points[i] ?? 0) - (a.points[i] ?? 0) || a.id.localeCompare(b.id));
  return new Map(sorted.map((s, k) => [s.id, k + 1]));
}

/** Position change since the previous completed round: positive = gained places. Null when there is no previous round. */
export function positionChanges(series: Series[], rounds: Round[]): Map<string, number | null> {
  const last = lastCompletedIndex(rounds);
  let prev = last - 1;
  while (prev >= 0 && !rounds[prev].completed) prev--;
  const out = new Map<string, number | null>();
  if (last < 0 || prev < 0) {
    for (const s of series) out.set(s.id, null);
    return out;
  }
  const now = ranksAfter(series, last);
  const before = ranksAfter(series, prev);
  for (const s of series) out.set(s.id, (before.get(s.id) ?? 0) - (now.get(s.id) ?? 0));
  return out;
}

/** Points scored over the last `n` completed rounds. */
export function recentPoints(s: Series, rounds: Round[], n: number): number {
  const done = rounds.map((r, i) => (r.completed ? i : -1)).filter((i) => i >= 0);
  if (done.length === 0) return 0;
  const end = done[done.length - 1];
  const startIdx = done.length > n ? done[done.length - 1 - n] : -1;
  return (s.points[end] ?? 0) - (startIdx >= 0 ? (s.points[startIdx] ?? 0) : 0);
}

export type Insight = { id: string; title: string; value: string; detail: string; basis: string; ids: string[] };

/**
 * A handful of insights, each computed from the progression and shown only when its data exists. `basis` says
 * exactly how it is measured. Drivers and constructors alike.
 */
export function championshipInsights(races: RaceSummary[], entity: EntityType, year: number): Insight[] {
  const { rounds, series } = buildProgression(races, entity);
  const last = lastCompletedIndex(rounds);
  if (last < 0 || series.length < 2) return [];
  const noun = entity === "drivers" ? "driver" : "team";
  const out: Insight[] = [];
  const lastRound = rounds[last];
  let prev = last - 1;
  while (prev >= 0 && !rounds[prev].completed) prev--;

  // Biggest points haul in the last completed round.
  const gains = series.map((s) => ({ s, gain: (s.points[last] ?? 0) - (prev >= 0 ? (s.points[prev] ?? 0) : 0) })).sort((a, b) => b.gain - a.gain);
  if (gains[0].gain > 0) {
    out.push({ id: "last-round", title: `Most points, ${lastRound.name}`, value: `+${gains[0].gain}`, detail: gains[0].s.label, basis: `Points scored in round ${lastRound.round}, the last completed round.`, ids: [gains[0].s.id] });
  }

  // Strongest recent form.
  const window = Math.min(3, rounds.filter((r) => r.completed).length);
  const form = series.map((s) => ({ s, pts: recentPoints(s, rounds, window) })).sort((a, b) => b.pts - a.pts);
  if (window >= 2 && form[0].pts > 0) {
    out.push({ id: "form", title: `Best form, last ${window} rounds`, value: `${form[0].pts} pts`, detail: form[0].s.label, basis: `Points scored across the last ${window} completed rounds.`, ids: [form[0].s.id] });
  }

  // Closest fight between neighbours in the top ten.
  const standing = [...series].sort((a, b) => lastValue(b) - lastValue(a)).slice(0, 10);
  let closest: { a: (typeof standing)[number]; b: (typeof standing)[number]; gap: number; pos: number } | null = null;
  for (let i = 0; i < standing.length - 1; i++) {
    const gap = lastValue(standing[i]) - lastValue(standing[i + 1]);
    if (!closest || gap < closest.gap) closest = { a: standing[i], b: standing[i + 1], gap, pos: i + 1 };
  }
  if (closest) {
    out.push({ id: "closest", title: `Closest fight, P${closest.pos} vs P${closest.pos + 1}`, value: closest.gap === 0 ? "Level" : `${closest.gap} pts`, detail: `${closest.a.label} and ${closest.b.label}`, basis: `Smallest points gap between neighbouring ${noun}s in the top ten after round ${lastRound.round}.`, ids: [closest.a.id, closest.b.id] });
  }

  // Biggest climber since the previous round.
  const changes = positionChanges(series, rounds);
  const climber = series.map((s) => ({ s, c: changes.get(s.id) ?? 0 })).sort((a, b) => b.c - a.c)[0];
  if (climber && climber.c > 0) {
    out.push({ id: "climber", title: "Biggest climber", value: `+${climber.c} ${climber.c === 1 ? "place" : "places"}`, detail: climber.s.label, basis: `Championship places gained in round ${lastRound.round}.`, ids: [climber.s.id] });
  }

  // The lead: how it moved, and whether it can still be caught.
  const [leader, second] = standing;
  if (leader && second) {
    const lead = lastValue(leader) - lastValue(second);
    const prevLead = prev >= 0 ? (leader.points[prev] ?? 0) - (second.points[prev] ?? 0) : null;
    // A cancelled round is not still to run.
    const remaining = rounds.filter((r) => !r.completed && !r.cancelled).length;
    const perRace = pointsPerRaceMax(year);
    // A team's two cars can at most finish first and second.
    const maxLeft = remaining * (entity === "drivers" ? perRace : perRace + 18);
    out.push({
      id: "lead",
      title: "The lead",
      value: `${lead} pts`,
      detail: `${leader.label} over ${second.label}${prevLead !== null ? ` (${lead - prevLead >= 0 ? "+" : ""}${lead - prevLead} since round ${rounds[prev].round})` : ""}`,
      basis: `Points gap between first and second after round ${lastRound.round}.`,
      ids: [leader.id, second.id],
    });
    if (remaining > 0) {
      out.push({
        id: "remaining",
        title: lead > maxLeft ? "Decided" : "Still to play for",
        value: `${maxLeft} pts`,
        detail: lead > maxLeft ? `${leader.label} can no longer be caught` : `${remaining} ${remaining === 1 ? "round" : "rounds"} left; the lead is ${Math.round((lead / maxLeft) * 100)}% of what remains`,
        basis: `${remaining} remaining Grands Prix × ${entity === "drivers" ? perRace : `${perRace + 18} (a one-two)`} points (Grand Prix points only; sprints not counted).`,
        ids: [leader.id],
      });
    }
  }
  return out;
}
