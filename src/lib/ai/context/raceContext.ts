// Race Intelligence context builder - the ONLY place in this feature that touches Supabase or
// computes racing analytics (see this file's own rule, restated in the prompt/orchestrator's own
// comments: neither of those may query data or derive facts themselves). First member of what will
// later include seasonContext.ts/archiveContext.ts - not built yet, but the directory and pattern
// exist from this file forward so later phases extend rather than reinvent.
//
// Reuses, rather than re-derives: computeMoments (src/lib/raceMoments.ts, the same function
// LapChart.tsx uses), getTrackHistory/computeSeasonStandings/getFavoriteDriverCard/
// getFavoriteTeamCard (src/lib/personalization.ts, the same functions the homepage's context.ts
// already uses for its own GLOBAL/PERSONAL split).

import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import {
  computeSeasonStandings,
  getFavoriteDriverCard,
  getFavoriteTeamCard,
  getTrackHistory,
  type FavoriteDriverCard,
  type FavoriteTeamCard,
  type TrackHistory,
} from "@/lib/personalization";
import { computeMoments, type Moment } from "@/lib/raceMoments";
import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import { getRaceById, getRaceLaps } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import type { RaceDoc, RaceResultEntry } from "@/lib/types/race";

export type ContextSource =
  | "classification"
  | "championship"
  | "weather"
  | "tireStrategy"
  | "compoundPace"
  | "traffic"
  | "safetyCar"
  | "keyMoments"
  | "trackHistory"
  | "favoriteDriver"
  | "favoriteTeam";

// Single source of truth for "all sources" - the route's "N of M available" count and the
// AnalysisCoverage UI both iterate this instead of re-hardcoding the 11-item list.
export const ALL_CONTEXT_SOURCES: ContextSource[] = [
  "classification",
  "championship",
  "weather",
  "tireStrategy",
  "compoundPace",
  "traffic",
  "safetyCar",
  "keyMoments",
  "trackHistory",
  "favoriteDriver",
  "favoriteTeam",
];

/** One real, citable fact per meaningful data point - not an exhaustive dump, the curated set worth
 * an AI claim referencing. Citing a fact id proves the specific claim was actually available at
 * generation time; it does not prove the model's prose accurately paraphrases it - a real, stated
 * limit, not oversold as full hallucination-proofing (see the schema validator's own comment). */
export interface EvidenceFact {
  id: string;
  source: ContextSource;
  fact: string;
}

export interface RaceIntelligenceContext {
  race: { name: string; round: number; season: number; circuitName: string; date: string | null; status: string };
  classification: {
    winner: { driver: string; driverName: string } | null;
    podium: { driver: string; driverName: string; position: number }[];
    dnfCount: number;
    fastestLap: { driver: string; driverName: string; timeSec: number } | null;
  };
  standingsImpact: { driverLeaderChanged: boolean; newDriverLeader: string | null; constructorLeaderChanged: boolean; newConstructorLeader: string | null };
  weather: RaceDoc["weather"] | null;
  tireStrategy: NonNullable<RaceDoc["tireStints"]>;
  tireCompoundPace: NonNullable<RaceDoc["tireCompoundPace"]> | null;
  safetyCarPeriods: number | null;
  trafficStats: NonNullable<RaceDoc["trafficStats"]> | null;
  keyMoments: Moment[];
  trackHistory: TrackHistory | null;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  evidenceFacts: EvidenceFact[];
  /** Plain deterministic booleans, NOT an AI-decided field - the UI's "N of 8 sources available"
   * count reads this directly. An OpenF1-fallback race (see pipeline/OPENF1_FALLBACK.md) will
   * legitimately show tireCompoundPace/traffic as false while classification/safetyCar are true -
   * the UI can honestly explain *why* an insight is unavailable instead of just omitting it. */
  dataCoverage: Record<ContextSource, boolean>;
}

function findResult(results: RaceResultEntry[] | undefined, driver: string): RaceResultEntry | undefined {
  return results?.find((r) => r.driver === driver);
}

export async function buildRaceIntelligenceContext(raceId: string, userId?: string): Promise<RaceIntelligenceContext> {
  const race = await getRaceById(raceId);
  if (!race) throw new Error(`buildRaceIntelligenceContext(${raceId}): race not found`);

  const results = race.results ?? [];
  const winnerRow = results.find((r) => r.finishPosition === 1);
  const podiumRows = results.filter((r) => r.finishPosition <= 3).sort((a, b) => a.finishPosition - b.finishPosition);
  const dnfCount = results.filter((r) => r.status === "dnf").length;
  const fastestRow = results.reduce<RaceResultEntry | null>((best, r) => {
    if (r.fastestLapSec === null) return best;
    if (!best || (best.fastestLapSec !== null && r.fastestLapSec < best.fastestLapSec)) return r;
    return best;
  }, null);

  // The four blocks below (standings impact, key moments, track history, personal favorites) are
  // mutually independent - none reads another's result, only `race`/`results`/`userId` (already in
  // hand). Previously four SEQUENTIAL awaits sitting entirely before this route's cache check can
  // even run (real, measured contributor to cache-hit latency - see providerFallback.ts-adjacent
  // perf audit, 2026-09-10). Running them concurrently doesn't change what's fetched or how errors
  // are handled (each branch keeps its own try/catch, unchanged) - only when.
  const [[standingsBefore, standingsAfter], keyMoments, trackHistory, personalCards] = await Promise.all([
    // Standings impact: compare the leader through this round vs. through the round before it -
    // reuses computeSeasonStandings' existing accumulation (see its own `throughRound` param,
    // added for exactly this) rather than re-deriving points totals here.
    Promise.all([computeSeasonStandings(race.year, race.round - 1), computeSeasonStandings(race.year, race.round)]),

    // Key moments: reuse getRaceLaps() + computeMoments(), the exact same data/function
    // LapChart.tsx already uses - genuinely derived from real lap-by-lap position data.
    (async (): Promise<Moment[]> => {
      try {
        const laps = await getRaceLaps(race.year, race.round);
        const nameByCode = new Map(results.map((r) => [r.driver, r.driverName]));
        return computeMoments(laps, (code) => nameByCode.get(code) ?? code);
      } catch {
        return []; // lap data genuinely absent for some races - never fabricated
      }
    })(),

    // Track history: same circuit-name -> archive-circuit-id resolution the homepage route
    // already uses, so a race's circuit reliably matches its archive history record.
    (async (): Promise<TrackHistory | null> => {
      try {
        const archiveCircuits = await getAllArchiveCircuits();
        const circuitLocalities = new Map(archiveCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
        const circuitIdsByName = new Map(archiveCircuits.filter((c) => c.name).map((c) => [c.name!.trim().toLowerCase(), c.circuitId]));
        const resolvedCircuitId = resolveCurrentCircuitToArchiveId(race.circuit, circuitLocalities, circuitIdsByName);
        return resolvedCircuitId ? await getTrackHistory(resolvedCircuitId) : null;
      } catch {
        return null;
      }
    })(),

    // Personal context - only ever populated for a real signed-in user with a real favorite;
    // never fetched at all otherwise, so there's nothing for the prompt's PERSONAL CONTEXT
    // section to contain for an anonymous/default-state request.
    (async (): Promise<{ favoriteDriver: FavoriteDriverCard | null; favoriteTeam: FavoriteTeamCard | null }> => {
      if (!userId) return { favoriteDriver: null, favoriteTeam: null };
      const profile = await getUserProfile(userId).catch(() => null);
      const [driverCard, teamCard] = await Promise.all([
        profile?.favoriteDrivers?.[0] ? getFavoriteDriverCard(profile.favoriteDrivers[0]).catch(() => null) : Promise.resolve(null),
        profile?.favoriteTeams?.[0] ? getFavoriteTeamCard(profile.favoriteTeams[0]).catch(() => null) : Promise.resolve(null),
      ]);
      return { favoriteDriver: driverCard, favoriteTeam: teamCard };
    })(),
  ]);
  const driverLeaderBefore = standingsBefore.drivers[0]?.driver ?? null;
  const driverLeaderAfter = standingsAfter.drivers[0]?.driver ?? null;
  const constructorLeaderBefore = standingsBefore.teams[0]?.team ?? null;
  const constructorLeaderAfter = standingsAfter.teams[0]?.team ?? null;
  const { favoriteDriver, favoriteTeam } = personalCards;

  // --- Evidence facts: curated, real, citable - built from the exact data assembled above ---
  const evidenceFacts: EvidenceFact[] = [];
  if (winnerRow) {
    evidenceFacts.push({ id: "classification-winner", source: "classification", fact: `${winnerRow.driverName} won the race.` });
    const second = results.find((r) => r.finishPosition === 2);
    if (second && second.finishGapSec !== null) {
      evidenceFacts.push({ id: "classification-margin", source: "classification", fact: `${winnerRow.driverName} won by ${second.finishGapSec.toFixed(3)}s over ${second.driverName}.` });
    }
  }
  if (podiumRows.length) {
    evidenceFacts.push({ id: "classification-podium", source: "classification", fact: `Podium: ${podiumRows.map((r) => `P${r.finishPosition} ${r.driverName}`).join(", ")}.` });
  }
  if (dnfCount > 0) {
    evidenceFacts.push({ id: "classification-dnf", source: "classification", fact: `${dnfCount} car${dnfCount === 1 ? "" : "s"} failed to finish.` });
  }
  if (fastestRow && fastestRow.fastestLapSec !== null) {
    evidenceFacts.push({ id: "classification-fastest-lap", source: "classification", fact: `${fastestRow.driverName} set the fastest lap.` });
  }
  const driverLeaderChanged = driverLeaderBefore !== driverLeaderAfter && driverLeaderAfter !== null;
  const constructorLeaderChanged = constructorLeaderBefore !== constructorLeaderAfter && constructorLeaderAfter !== null;
  if (driverLeaderChanged) {
    const name = findResult(results, driverLeaderAfter!)?.driverName ?? driverLeaderAfter;
    evidenceFacts.push({ id: "championship-driver-leader-change", source: "championship", fact: `${name} became the new championship leader.` });
  }
  if (constructorLeaderChanged) {
    evidenceFacts.push({ id: "championship-constructor-leader-change", source: "championship", fact: `${constructorLeaderAfter} became the new constructors' championship leader.` });
  }
  if (race.weather) {
    const w = race.weather;
    evidenceFacts.push({ id: "weather-conditions", source: "weather", fact: `${w.rainfall ? "Wet" : "Dry"} conditions, ${w.airTempC}C air / ${w.trackTempC}C track, ${w.humidityPct}% humidity.` });
  }
  if (race.tireStints && race.tireStints.length > 0) {
    const compounds = new Set(race.tireStints.map((t) => t.compound));
    evidenceFacts.push({ id: "tire-strategy-summary", source: "tireStrategy", fact: `${race.tireStints.length} tire stints recorded across ${compounds.size} compound${compounds.size === 1 ? "" : "s"} (${[...compounds].join(", ")}).` });
  }
  if (race.tireCompoundPace && race.tireCompoundPace.length > 0) {
    for (const p of race.tireCompoundPace.slice(0, 8)) {
      if (p.degradationSecPerLap === null) continue;
      evidenceFacts.push({ id: `compound-pace-${p.driver}-${p.compound}`, source: "compoundPace", fact: `${p.driver} on ${p.compound}: ${p.degradationSecPerLap >= 0 ? "+" : ""}${p.degradationSecPerLap.toFixed(3)}s/lap degradation over ${p.lapCount} laps.` });
    }
  }
  if (race.safetyCarPeriods !== undefined && race.safetyCarPeriods !== null) {
    evidenceFacts.push({ id: "safety-car-count", source: "safetyCar", fact: `${race.safetyCarPeriods} safety car period${race.safetyCarPeriods === 1 ? "" : "s"}.` });
  }
  if (race.trafficStats && race.trafficStats.length > 0) {
    const heavyTraffic = race.trafficStats.filter((t) => t.pctLapsCloseBehind > 0.5).length;
    evidenceFacts.push({ id: "traffic-summary", source: "traffic", fact: `${heavyTraffic} driver${heavyTraffic === 1 ? "" : "s"} spent over half the race within 1.5s of the car ahead.` });
  }
  for (const m of keyMoments) {
    evidenceFacts.push({ id: `key-moment-lap-${m.lap}-${evidenceFacts.length}`, source: "keyMoments", fact: `Lap ${m.lap}: ${m.text}` });
  }
  if (trackHistory) {
    if (trackHistory.topPerformer) evidenceFacts.push({ id: "track-history-top-performer", source: "trackHistory", fact: `${trackHistory.topPerformer.driverName} has the most wins at this circuit (${trackHistory.topPerformer.wins}).` });
    if (trackHistory.defendingWinner) evidenceFacts.push({ id: "track-history-defending-winner", source: "trackHistory", fact: `${trackHistory.defendingWinner.driverName} won the most recent race held here (${trackHistory.defendingWinner.year}).` });
  }
  if (favoriteDriver) {
    const row = findResult(results, favoriteDriver.code ?? "");
    if (row) evidenceFacts.push({ id: "favorite-driver-result", source: "favoriteDriver", fact: `${favoriteDriver.name} finished P${row.finishPosition} for ${row.team}.` });
  }
  if (favoriteTeam) {
    const rows = results.filter((r) => r.team === favoriteTeam!.currentName);
    if (rows.length) evidenceFacts.push({ id: "favorite-team-result", source: "favoriteTeam", fact: `${favoriteTeam.name}: ${rows.map((r) => `P${r.finishPosition} ${r.driverName}`).join(", ")}.` });
  }

  const dataCoverage: Record<ContextSource, boolean> = {
    classification: results.length > 0,
    championship: driverLeaderChanged || constructorLeaderChanged,
    weather: !!race.weather,
    tireStrategy: !!(race.tireStints && race.tireStints.length > 0),
    compoundPace: !!(race.tireCompoundPace && race.tireCompoundPace.length > 0),
    traffic: !!(race.trafficStats && race.trafficStats.length > 0),
    safetyCar: race.safetyCarPeriods !== undefined && race.safetyCarPeriods !== null,
    keyMoments: keyMoments.length > 0,
    trackHistory: !!trackHistory,
    favoriteDriver: !!favoriteDriver,
    favoriteTeam: !!favoriteTeam,
  };

  return {
    race: { name: race.name, round: race.round, season: race.year, circuitName: race.circuit, date: race.raceDate ?? null, status: race.status },
    classification: {
      winner: winnerRow ? { driver: winnerRow.driver, driverName: winnerRow.driverName } : null,
      podium: podiumRows.map((r) => ({ driver: r.driver, driverName: r.driverName, position: r.finishPosition })),
      dnfCount,
      fastestLap: fastestRow && fastestRow.fastestLapSec !== null ? { driver: fastestRow.driver, driverName: fastestRow.driverName, timeSec: fastestRow.fastestLapSec } : null,
    },
    standingsImpact: {
      driverLeaderChanged,
      newDriverLeader: driverLeaderChanged ? driverLeaderAfter : null,
      constructorLeaderChanged,
      newConstructorLeader: constructorLeaderChanged ? constructorLeaderAfter : null,
    },
    weather: race.weather ?? null,
    tireStrategy: race.tireStints ?? [],
    tireCompoundPace: race.tireCompoundPace ?? null,
    safetyCarPeriods: race.safetyCarPeriods ?? null,
    trafficStats: race.trafficStats ?? null,
    keyMoments,
    trackHistory,
    favoriteDriver,
    favoriteTeam,
    evidenceFacts,
    dataCoverage,
  };
}

// Referenced by the route/orchestrator to decide whether personal generation is worth attempting
// at all - avoids a wasted model call section for a signed-in user with no real favorite set.
export function hasPersonalContext(context: RaceIntelligenceContext): boolean {
  return !!context.favoriteDriver || !!context.favoriteTeam;
}

/** Serializes the context into the prompt string, same tag-delimited convention context.ts already
 * uses for the homepage (<STRUCTURED_F1_DATA>/<PERSONAL_CONTEXT>). `includePersonal` is a separate
 * argument, not just "does context.favoriteDriver exist" - the orchestrator can request a
 * shared-only generation (partial cache-hit case) and this must omit the section entirely then,
 * not just leave it empty, so the model has no PERSONAL_CONTEXT tag to accidentally reference. */
export function formatRaceIntelligenceContext(context: RaceIntelligenceContext, includePersonal: boolean): string {
  const sections: string[] = [];

  sections.push("<GLOBAL_RACE_DATA>");
  sections.push(`Race: ${context.race.name}, Round ${context.race.round} of ${context.race.season}, ${context.race.circuitName}.`);
  if (context.classification.winner) sections.push(`Winner: ${context.classification.winner.driverName}.`);
  sections.push(`DNFs: ${context.classification.dnfCount}.`);
  sections.push("</GLOBAL_RACE_DATA>");

  sections.push("<RACE_EVIDENCE>");
  sections.push("Every fact below has a real id. Cite the exact id(s) that support each claim you make in evidenceIds - never an id not listed here.");
  for (const f of context.evidenceFacts) {
    sections.push(`[${f.id}] (${f.source}) ${f.fact}`);
  }
  if (context.evidenceFacts.length === 0) sections.push("No structured evidence available for this race.");
  sections.push("</RACE_EVIDENCE>");

  if (includePersonal && (context.favoriteDriver || context.favoriteTeam)) {
    sections.push("<PERSONAL_CONTEXT>");
    if (context.favoriteDriver) sections.push(`Favorite driver: ${context.favoriteDriver.name} (${context.favoriteDriver.team ?? "team unknown"}).`);
    if (context.favoriteTeam) sections.push(`Favorite team: ${context.favoriteTeam.name}.`);
    sections.push("Generate `personal` from this section plus RACE_EVIDENCE only. Do not let this section influence `shared` in any way.");
    sections.push("</PERSONAL_CONTEXT>");
  }

  return sections.join("\n\n");
}
