// Deterministic, typed context builders for the Season page's AI layer.
//
// Why this file exists at all: season-compare used to hand the model the WHOLE season blob
// (every driver's standings row, every battle) and never told it which two entities the user had
// actually selected. The model reliably latched onto the most comparison-shaped thing in that
// blob - the tightest battle - and wrote about a completely different pair than the one on
// screen. Confirmed live against the real provider, not inferred: with Hamilton/Antonelli
// selected the model returned "Hulkenberg and Sainz locked on equal points", exactly the bug the
// UI showed.
//
// The fix is structural, not a stronger instruction: the model now receives ONLY the two selected
// entities' own facts, with their names stated up front. There is no third party in the context
// for it to drift onto.
//
// Same rule as every other context builder here (raceContext.ts): every number is computed
// server-side from authoritative data and handed over as text. The model interprets; it never
// calculates, and it is never given client-supplied statistics.

import type { ComparePair, RaceSummary, SeasonRecord, Battle, DriverStandingRow, ConstructorStandingRow } from "@/app/season/_service/season.pure";
import { RECENT_FORM_WINDOW, completedRaces, computePositionChanges, entityResults, recentResults } from "@/app/season/_service/season.pure";

/** Bumped whenever the shape below or the prompt that consumes it changes, so entries cached
 * under the old shape become unreachable (a new key) rather than being served as if they were
 * generated under the new one. */
export const SEASON_CONTEXT_VERSION = "season-ctx-v2";

function n(value: number | null | undefined, digits = 1): string {
  return value == null ? "n/a" : value.toFixed(digits);
}

// ─── Compare ───────────────────────────────────────────────────────────────────

/** The two-entity context. Deliberately contains no other driver, no team standings, and no
 * battle list - there is nothing else in here for the model to write about. */
export function formatComparePairContext(pair: ComparePair): string {
  const kind = pair.entityType === "drivers" ? "DRIVER" : "TEAM";
  const side = (s: ComparePair["a"], tag: "A" | "B") =>
    [
      `${tag}. ${s.name}${s.team ? ` (${s.team})` : ""}`,
      `  championship points: ${s.points}`,
      `  wins: ${s.wins}`,
      `  podiums: ${s.podiums}`,
      s.poles !== null ? `  pole positions: ${s.poles}` : null,
      `  rounds with a classified result: ${s.scoredRounds}`,
      `  points per round: ${n(s.pointsPerRace)}`,
      `  average finishing position: ${n(s.averageFinish)}`,
      s.bestFinish !== null ? `  best finish: P${s.bestFinish}` : null,
      `  retirements: ${s.dnfs}`,
      `  points in the last ${pair.momentumWindow} rounds: ${s.recentPoints}`,
      `  average finish in the last ${pair.momentumWindow} rounds: ${n(s.recentAverageFinish)}`,
    ]
      .filter(Boolean)
      .join("\n");

  const ahead =
    pair.aheadId === null
      ? "They are level on championship points."
      : `${pair.aheadId === pair.a.id ? pair.a.name : pair.b.name} leads on championship points by ${pair.pointsGap}.`;

  const momentumName = pair.momentum === "EVEN" ? "neither" : pair.momentum === "A" ? pair.a.name : pair.b.name;

  return `THE ONLY TWO ${kind}S YOU MAY WRITE ABOUT: ${pair.a.name} and ${pair.b.name}.
Season ${pair.season}, after ${pair.completedRounds} completed rounds.

${side(pair.a, "A")}

${side(pair.b, "B")}

CHAMPIONSHIP POINTS STANDING
${ahead}

HEAD-TO-HEAD (race classification - a DIFFERENT metric from championship points; never conflate the two)
  ${pair.a.name} finished ahead: ${pair.h2h.aWins}
  ${pair.b.name} finished ahead: ${pair.h2h.bWins}
  dead heats: ${pair.h2h.ties}
  rounds where both were classified: ${pair.h2h.comparableRounds}
  rounds excluded (one of them had no result): ${pair.h2h.excludedRounds}
  teammates: ${pair.h2h.isTeammates ? "yes" : "no"}

MOMENTUM (already computed for you - points scored across the last ${pair.momentumWindow} rounds)
  value: ${pair.momentum}${pair.momentum === "EVEN" ? " (level)" : ` (${momentumName})`}
  Report this value. Do not compute a different one.`;
}

// ─── Season narrative ──────────────────────────────────────────────────────────

export type SeasonNarrativeContext = {
  season: number;
  status: "ongoing" | "completed";
  completedRounds: number;
  remainingRounds: number;
  nextRace: { round: number; name: string } | null;
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  battles: Battle[];
  records: SeasonRecord[];
  raceSummaries: RaceSummary[];
  /** Position/points movement since the previous completed round, already computed. */
  movers: { name: string; positionDelta: number | null; pointsDelta: number | null }[];
  /** Points scored across the recent-form window, per driver, already computed. */
  recentForm: { name: string; points: number }[];
  formWindow: number;
};

/** Every id the model is allowed to reference, in the exact code space the UI highlights by.
 * Previously the prompt never stated an id space at all, so the model answered with display names
 * ("Kimi Antonelli") while validation checked against driver codes ("ANT") - every highlight was
 * silently dropped. Confirmed live against the real provider. */
export function seasonValidIds(ctx: SeasonNarrativeContext): string[] {
  return [
    ...ctx.drivers.map((d) => d.driver),
    ...ctx.constructors.map((c) => c.team),
    ...ctx.battles.map(battleId),
    ...ctx.records.map((r) => r.id),
  ];
}

export function battleId(b: Battle): string {
  return `${b.type}:${b.aId}-vs-${b.bId}`;
}

/** The season data this builder reads. Structurally a subset of getSeasonDetailData's return, so
 * the full result can be passed straight in without the AI layer depending on that function's
 * exact shape. */
export type SeasonDataForContext = {
  year: number;
  status: "ongoing" | "completed";
  racesCompleted: number;
  racesRemaining: number;
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string | null>[];
  raceSummaries: RaceSummary[];
  battles: Battle[];
  records: SeasonRecord[];
};

/** Assembles the deterministic narrative context from authoritative season data. This is the ONLY
 * thing the model is ever given for the season narrative.
 *
 * Lives here rather than in the route that calls it: a Next route module may only export HTTP
 * handlers and route config, so an exported helper there fails the build. It also belongs next to
 * the formatter that consumes it.
 */
export function buildSeasonNarrativeContext(data: SeasonDataForContext): SeasonNarrativeContext {
  const nextRace = data.raceSummaries.find((r) => r.state === "next") ?? null;
  const changes = computePositionChanges(data.drivers, data.constructors, data.progression);
  const formWindow = Math.min(RECENT_FORM_WINDOW, completedRaces(data.raceSummaries).length);

  const movers = changes.drivers
    .map((c) => ({
      name: data.drivers.find((d) => d.driver === c.entityId)?.driverName ?? c.entityId,
      positionDelta: c.positionDelta,
      pointsDelta: c.pointsDelta,
    }))
    .filter((m) => (m.positionDelta ?? 0) !== 0 || (m.pointsDelta ?? 0) !== 0)
    .sort((a, b) => Math.abs(b.positionDelta ?? 0) - Math.abs(a.positionDelta ?? 0) || (b.pointsDelta ?? 0) - (a.pointsDelta ?? 0));

  const recentForm = data.drivers
    .map((d) => ({ name: d.driverName, points: recentResults(entityResults(data.raceSummaries, d.driver, false)).reduce((sum, r) => sum + r.points, 0) }))
    .sort((a, b) => b.points - a.points);

  return {
    season: data.year,
    status: data.status,
    completedRounds: data.racesCompleted,
    remainingRounds: data.racesRemaining,
    nextRace: nextRace ? { round: nextRace.round, name: nextRace.name } : null,
    drivers: data.drivers,
    constructors: data.constructors,
    battles: data.battles,
    records: data.records,
    raceSummaries: data.raceSummaries,
    movers,
    recentForm,
    formWindow,
  };
}

export function formatSeasonNarrativeContext(ctx: SeasonNarrativeContext): string {
  const completed = completedRaces(ctx.raceSummaries);
  const recentRaces = completed.slice(-5).map((r) => `R${r.round} ${r.name}${r.winnerName ? ` - won by ${r.winnerName}` : ""}`);

  const driverLines = ctx.drivers
    .slice(0, 12)
    .map((d, i) => `  ${i + 1}. [${d.driver}] ${d.driverName} (${d.team}) - ${d.points} pts, ${d.wins} wins, ${d.podiums} podiums`);

  const teamLines = ctx.constructors.slice(0, 10).map((c, i) => `  ${i + 1}. [${c.team}] ${c.team} - ${c.points} pts, ${c.wins} wins`);

  // The first entry is marked explicitly rather than left implicit in the ordering: asked only to
  // trust "tightest first", the model picked the SECOND battle and called it the tightest
  // (observed live). Stating the fact removes the judgement call entirely.
  const battleLines = ctx.battles.map(
    (b, i) =>
      `  [${battleId(b)}] ${b.aLabel} ${b.aValue} vs ${b.bValue} ${b.bLabel} - ${b.gap === 0 ? "level on points" : `${b.gap} pt gap`} (metric: ${b.metricLabel})${i === 0 ? "  <- THIS IS THE TIGHTEST BATTLE IN THE SEASON" : ""}`,
  );

  const recordLines = ctx.records.map((r) => `  [${r.id}] ${r.label}: ${r.name} - ${r.value}`);

  const moverLines = ctx.movers
    .slice(0, 8)
    .map((m) => `  ${m.name}: ${m.positionDelta ? `${m.positionDelta > 0 ? "+" : ""}${m.positionDelta} places` : "no position change"}${m.pointsDelta ? `, ${m.pointsDelta > 0 ? "+" : ""}${m.pointsDelta} pts` : ""}`);

  const formLines = ctx.recentForm.slice(0, 6).map((f) => `  ${f.name}: ${f.points} pts`);

  return `SEASON
  year: ${ctx.season}
  status: ${ctx.status}
  completed rounds: ${ctx.completedRounds}
  remaining rounds: ${ctx.remainingRounds}
  next round: ${ctx.nextRace ? `R${ctx.nextRace.round} ${ctx.nextRace.name}` : "none - the season is over"}

DRIVERS' CHAMPIONSHIP (id in brackets)
${driverLines.join("\n") || "  no classified drivers yet"}

CONSTRUCTORS' CHAMPIONSHIP (id in brackets)
${teamLines.join("\n") || "  no classified teams yet"}

CLOSEST BATTLES (id in brackets, tightest first)
${battleLines.join("\n") || "  none yet"}

SEASON RECORDS (id in brackets)
${recordLines.join("\n") || "  none yet"}

MOVEMENT SINCE THE PREVIOUS COMPLETED ROUND
${moverLines.join("\n") || "  nothing moved"}

POINTS SCORED IN THE LAST ${ctx.formWindow} ROUNDS
${formLines.join("\n") || "  no rounds completed yet"}

MOST RECENT COMPLETED ROUNDS
${recentRaces.map((r) => `  ${r}`).join("\n") || "  none yet"}`;
}

// ─── Race event ────────────────────────────────────────────────────────────────

export type RaceEventContext = {
  season: number;
  race: RaceSummary;
  /** Championship state going into (or out of) this weekend. */
  championship: { leader: string; leaderPoints: number; second: string | null; secondPoints: number | null; gap: number | null };
  /** Previous winners at this circuit, from rounds already in this season's data. Empty is fine. */
  priorFormLines: string[];
};

export function formatRaceEventContext(ctx: RaceEventContext): string {
  const r = ctx.race;
  const sessionLines = r.sessions.map((s) => `  ${s.label} - ${s.date} UTC - ${s.state}${s.result ? ` - ${s.result.label}: ${s.result.value}` : ""}`);
  const weather = r.weekendStatus === "completed"
    ? r.raceWeather
      ? `  air ${r.raceWeather.airTempC}C, track ${r.raceWeather.trackTempC}C, humidity ${r.raceWeather.humidityPct}%, rainfall during the session: ${r.raceWeather.rainfall ? "yes" : "no"}`
      : "  not recorded"
    : r.forecast
      ? `  forecast (${r.forecast.source === "openweathermap" ? "live forecast" : "historical average"}): air ${r.forecast.airTempC}C, rain probability ${Math.round(r.forecast.rainProbability * 100)}%`
      : "  no forecast available";

  const result = r.weekendStatus === "completed"
    ? [
        r.winnerName ? `  winner: ${r.winnerName}` : null,
        r.poleSitterName ? `  pole: ${r.poleSitterName}` : null,
        r.podium.length > 0 ? `  podium: ${r.podium.map((p) => `P${p.position} ${p.driverName}`).join(", ")}` : null,
        r.fastestLap ? `  fastest lap: ${r.fastestLap.driverName}` : null,
      ].filter(Boolean).join("\n")
    : "  not yet run";

  return `EVENT
  season: ${ctx.season}
  round: ${r.round}
  name: ${r.name}
  circuit: ${r.circuit ?? "unknown"}${r.country ? `, ${r.country}` : ""}
  weekend format: ${r.isSprintWeekend ? "sprint weekend" : "conventional weekend"}
  state: ${r.weekendStatus}

SESSIONS
${sessionLines.join("\n") || "  no schedule available"}

WEATHER
${weather}

RESULT
${result}

CHAMPIONSHIP CONTEXT
  leader: ${ctx.championship.leader} on ${ctx.championship.leaderPoints} pts${ctx.championship.second ? `, ahead of ${ctx.championship.second} on ${ctx.championship.secondPoints} pts (${ctx.championship.gap} pt gap)` : ""}

CIRCUIT / FORM NOTES
${ctx.priorFormLines.map((l) => `  ${l}`).join("\n") || "  none available"}`;
}
