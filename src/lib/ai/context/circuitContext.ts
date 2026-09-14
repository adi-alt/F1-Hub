// Deterministic context for the Circuits section's AI layer - the Apex Circuit Take editorial
// insight and Ask Apex's circuit-scoped grounding both consume exactly this, never a client-built
// blob. Same discipline as seasonContext.ts: every fact here is computed server-side from
// authoritative data before the model ever sees it, so the model interprets real numbers rather
// than being asked to remember or invent them.

import type { CircuitFacts } from "@/lib/circuitFacts";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";
import { computeRaceTrends, computeTopWinners, computeTrackRecords, computeWeatherHistory } from "@/lib/circuitIntelligence";
import type { RaceSummary } from "@/app/season/_service/season.pure";

export type CircuitAiState = "completed" | "next" | "upcoming" | "unscheduled";

export type CircuitContext = {
  location: string;
  displayName: string;
  grandPrixName: string | null;
  country: string | null;
  year: number;
  state: CircuitAiState;
  facts: CircuitFacts | null;
  /** Real facts about THIS season's own round here, only when it has actually run - never a
   * result for a race that hasn't happened. */
  currentSeasonResult:
    | {
        winner: string | null;
        podium: string[];
        pole: string | null;
        fastestLap: string | null;
        dnfCount: number;
        biggestGainer: { name: string; places: number } | null;
      }
    | null;
  /** Real facts about the upcoming round, only when it hasn't happened yet. */
  upcoming: { raceDateIso: string | null; forecastAirTempC: number | null; forecastRainPct: number | null } | null;
  timelineYears: number;
  records: ReturnType<typeof computeTrackRecords>;
  topWinners: { driver: string; wins: number }[];
  trends: ReturnType<typeof computeRaceTrends>;
  weather: ReturnType<typeof computeWeatherHistory>;
  /** Every real name formatCircuitContext actually presents to the model, verbatim - the only
   * evidenceIds validateSharedCircuitIntelligence should accept as real. Names, not codes: unlike
   * seasonContext.ts's id space (driver codes, because that's what the Season UI highlights by),
   * nothing here is presented to the model as a code, so a code-based id space would just reject
   * every citation the model makes against text it can actually see. */
  evidenceIds: string[];
};

export function buildCircuitContext(
  location: string,
  displayName: string,
  grandPrixName: string | null,
  country: string | null,
  year: number,
  facts: CircuitFacts | null,
  currentSeasonRace: RaceSummary | null,
  timeline: CircuitYearRecord[],
): CircuitContext {
  const state: CircuitAiState = currentSeasonRace ? (currentSeasonRace.state === "completed" ? "completed" : currentSeasonRace.state === "next" ? "next" : "upcoming") : "unscheduled";

  let currentSeasonResult: CircuitContext["currentSeasonResult"] = null;
  if (currentSeasonRace && state === "completed") {
    const gainers = currentSeasonRace.results
      .filter((r) => r.grid != null && r.status !== "dnf")
      .map((r) => ({ name: r.driverName, places: (r.grid as number) - r.finishPosition }))
      .sort((a, b) => b.places - a.places);
    currentSeasonResult = {
      winner: currentSeasonRace.winnerName,
      podium: currentSeasonRace.podium.map((p) => `P${p.position} ${p.driverName}`),
      pole: currentSeasonRace.poleSitterName,
      fastestLap: currentSeasonRace.fastestLap?.driverName ?? null,
      dnfCount: currentSeasonRace.results.filter((r) => r.status === "dnf").length,
      biggestGainer: gainers[0] && gainers[0].places > 0 ? { name: gainers[0].name, places: gainers[0].places } : null,
    };
  }

  const trackRecords = computeTrackRecords(timeline);
  const topWinners = computeTopWinners(timeline, 3);
  const evidenceIds = [...new Set(
    [
      currentSeasonRace?.winnerName,
      currentSeasonRace?.poleSitterName,
      currentSeasonRace?.fastestLap?.driverName,
      currentSeasonResult?.biggestGainer?.name,
      ...currentSeasonRace?.podium.map((p) => p.driverName) ?? [],
      trackRecords.mostWins?.driver,
      trackRecords.mostPoles?.driver,
      ...topWinners.map((w) => w.driver),
    ].filter((v): v is string => !!v),
  )];

  let upcoming: CircuitContext["upcoming"] = null;
  if (currentSeasonRace && state !== "completed") {
    upcoming = {
      raceDateIso: currentSeasonRace.raceDate,
      forecastAirTempC: currentSeasonRace.forecast?.airTempC ?? null,
      forecastRainPct: currentSeasonRace.forecast ? Math.round(currentSeasonRace.forecast.rainProbability * 100) : null,
    };
  }

  return {
    location,
    displayName,
    grandPrixName,
    country,
    year,
    state,
    facts,
    currentSeasonResult,
    upcoming,
    timelineYears: timeline.length,
    records: trackRecords,
    topWinners,
    evidenceIds,
    trends: computeRaceTrends(timeline),
    weather: computeWeatherHistory(timeline),
  };
}

/** Every id the model is allowed to cite as evidence - same role as seasonContext.ts's own
 * seasonValidIds, kept as a thin wrapper (rather than inlining `ctx.evidenceIds` at the one real
 * call site) for the same calling convention orchestrator.ts already uses for Season. */
export function circuitValidIds(ctx: CircuitContext): string[] {
  return ctx.evidenceIds;
}

export function formatCircuitContext(ctx: CircuitContext): string {
  const f = ctx.facts;
  const factLines = f
    ? [
        `  length: ${f.lengthKm.toFixed(3)} km`,
        `  turns: ${f.turns}`,
        `  direction: ${f.direction}`,
        `  type: ${f.trackType}`,
        `  first Grand Prix here: ${f.firstGrandPrix}`,
        f.nightRace ? "  night race: yes" : null,
        f.lapRecord ? `  lap record: ${f.lapRecord.timeSec.toFixed(3)}s by ${f.lapRecord.driverName} (${f.lapRecord.year})` : null,
      ].filter(Boolean)
    : ["  no physical characteristics on record for this circuit"];

  const resultLines = ctx.currentSeasonResult
    ? [
        ctx.currentSeasonResult.winner ? `  winner: ${ctx.currentSeasonResult.winner}` : null,
        ctx.currentSeasonResult.podium.length ? `  podium: ${ctx.currentSeasonResult.podium.join(", ")}` : null,
        ctx.currentSeasonResult.pole ? `  pole: ${ctx.currentSeasonResult.pole}` : null,
        ctx.currentSeasonResult.fastestLap ? `  fastest lap: ${ctx.currentSeasonResult.fastestLap}` : null,
        `  retirements: ${ctx.currentSeasonResult.dnfCount}`,
        ctx.currentSeasonResult.biggestGainer ? `  biggest gainer: ${ctx.currentSeasonResult.biggestGainer.name} (+${ctx.currentSeasonResult.biggestGainer.places} places)` : null,
      ].filter(Boolean)
    : null;

  const upcomingLines = ctx.upcoming
    ? [
        ctx.upcoming.raceDateIso ? `  race date: ${ctx.upcoming.raceDateIso}` : null,
        ctx.upcoming.forecastAirTempC != null ? `  forecast air temp: ${Math.round(ctx.upcoming.forecastAirTempC)}C` : null,
        ctx.upcoming.forecastRainPct != null ? `  forecast rain chance: ${ctx.upcoming.forecastRainPct}%` : null,
      ].filter(Boolean)
    : null;

  const records = ctx.records;
  const recordLines = [
    records.mostWins ? `  most wins: ${records.mostWins.driver} (${records.mostWins.count})` : null,
    records.mostPoles ? `  most poles: ${records.mostPoles.driver} (${records.mostPoles.count})` : null,
    records.closestMargin ? `  closest finish: ${records.closestMargin.sec.toFixed(3)}s (${records.closestMargin.year})` : null,
    records.largestMargin ? `  largest margin: ${records.largestMargin.sec.toFixed(3)}s (${records.largestMargin.year})` : null,
  ].filter(Boolean);

  const trendLines = [
    ctx.trends.poleToWinPct != null ? `  pole converted to win: ${ctx.trends.poleToWinPct.toFixed(0)}% of the time` : null,
    ctx.trends.avgFieldMovement != null ? `  average grid-to-finish movement: ${ctx.trends.avgFieldMovement.toFixed(1)} places` : null,
    ctx.weather.dryPct != null ? `  dry ${ctx.weather.dryPct.toFixed(0)}% of recorded seasons (n=${ctx.weather.sampleSize})` : null,
  ].filter(Boolean);

  return `CIRCUIT
  name: ${ctx.displayName}
  grand prix: ${ctx.grandPrixName ?? "unknown"}
  location: ${[ctx.location, ctx.country].filter(Boolean).join(", ") || "unknown"}
  season: ${ctx.year}
  state: ${ctx.state}

PHYSICAL CHARACTERISTICS
${factLines.join("\n")}

${ctx.state === "completed" ? `THIS SEASON'S RESULT HERE\n${resultLines!.join("\n")}` : ""}
${ctx.state === "next" || ctx.state === "upcoming" ? `UPCOMING ROUND\n${upcomingLines?.join("\n") || "  no further detail available yet"}` : ""}

HISTORY (${ctx.timelineYears} seasons on record, top 3 winners: ${ctx.topWinners.map((w) => `${w.driver} (${w.wins})`).join(", ") || "none"})
${recordLines.length ? recordLines.join("\n") : "  no records available yet"}
${trendLines.length ? trendLines.join("\n") : ""}`;
}
