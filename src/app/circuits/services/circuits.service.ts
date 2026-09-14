// The Circuits section's one data layer.
//
// Everything here resolves through getSeasonPageData for "what is the current season doing" -
// that function already computes exactly the round/status/winner/podium/pole/photo state this
// section needs (buildRaceSummaries in app/season/_service/season.service.ts), and re-deriving
// "is this round completed, next, or upcoming" a second time here would be a second place that
// definition could quietly disagree with the Season page's own. A circuit's identity (which
// physical venue this round's `circuit` string actually is) is resolved through the SAME
// circuitSlug.ts machinery the homepage's track-history section and profile page already use, not
// a new alias table - one normalization layer, not a second one drifting out of sync with it.

import { getSeasonPageData } from "@/app/season/_service/season.service";
import type { RaceSummary } from "@/app/season/_service/season.pure";
import { getAllArchiveCircuits, getArchiveRacesByCircuitId, type ArchiveCircuit, type ArchiveRaceDoc } from "@/lib/supabase/archive";
import { getRacesByCircuit } from "@/lib/supabase/races";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { getCircuitFacts, type CircuitFacts } from "@/lib/circuitFacts";
import { buildCircuitTimeline, computeRaceTrends, type CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { RaceDoc } from "@/lib/types/race";

export type CircuitExplorerEntry = {
  race: RaceSummary;
  facts: CircuitFacts | null;
};

export type CircuitExplorerData = {
  year: number;
  entries: CircuitExplorerEntry[];
  completedCount: number;
  remainingCount: number;
  nextRound: number | null;
};

/** Every round on the current season's real calendar, in order, each paired with whatever static
 * facts this app has for that physical venue. This is the ONLY thing the Circuits homepage reads -
 * it never recomputes season status on its own. */
export async function getCircuitsExplorerData(year: number, uid: string): Promise<CircuitExplorerData> {
  const season = await getSeasonPageData(year, uid);
  const entries: CircuitExplorerEntry[] = season.raceSummaries.map((race) => ({
    race,
    facts: getCircuitFacts(race.circuit ?? ""),
  }));
  const nextRound = season.raceSummaries.find((r) => r.state === "next")?.round ?? null;
  return {
    year,
    entries,
    completedCount: season.racesCompleted,
    remainingCount: season.racesRemaining,
    nextRound,
  };
}

export type CircuitDetailData = {
  year: number;
  /** This season's own round at this circuit, if the calendar has one - null for a circuit that
   * isn't on the current calendar at all (a venue the season doesn't visit this year). */
  currentSeasonRace: RaceSummary | null;
  facts: CircuitFacts | null;
  archiveCircuit: ArchiveCircuit | null;
  /** Every real classified year at this physical track, most recent first - the merge of
   * archive_races and the live `races` schema circuitIntelligence.ts already implements. */
  timeline: CircuitYearRecord[];
  /** Real RaceDoc rows for this circuit from the live `races` table (2018+, whatever years have a
   * row there) - for the pole-time trend chart and past-winners list, which read RaceDoc directly
   * rather than the smaller CircuitYearRecord projection. */
  liveRaces: RaceDoc[];
  archiveRaces: ArchiveRaceDoc[];
  /** The most recent COMPLETED live race at this circuit (any year, not just this season) - the
   * one used to feed the track simulation's real grid/finish/pit data, since a track visualization
   * with nothing to show is worse than one showing last year's real classification when this
   * year's round hasn't happened yet. */
  raceForSimulation: RaceDoc | null;
};

/** `location` is the exact string this app already routes circuits by (circuitHref's own query
 * param - FastF1's own `circuit`/`location` field, e.g. "Melbourne") - not a new slug format, the
 * one every existing link into this section already produces. Returns null only when NEITHER the
 * live `races` table nor the archive has ever recorded anything at this location - a genuinely
 * unknown circuit, not a data gap in one specific source. */
export async function getCircuitDetailData(location: string, year: number, uid: string): Promise<CircuitDetailData | null> {
  const [season, liveRaces, allCircuits] = await Promise.all([
    getSeasonPageData(year, uid),
    getRacesByCircuit(location),
    getAllArchiveCircuits(),
  ]);

  const currentSeasonRace = season.raceSummaries.find((r) => (r.circuit ?? "").toLowerCase() === location.toLowerCase()) ?? null;

  const circuitLocalities = new Map(allCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
  const archiveId = resolveCurrentCircuitToArchiveId(location, circuitLocalities);
  const archiveCircuit = archiveId ? (allCircuits.find((c) => c.circuitId === archiveId) ?? null) : null;
  const archiveRaces = archiveId ? await getArchiveRacesByCircuitId(archiveId) : [];

  if (liveRaces.length === 0 && archiveRaces.length === 0 && !currentSeasonRace) return null;

  const timeline = buildCircuitTimeline(liveRaces, archiveRaces);
  const raceForSimulation = [...liveRaces].filter((r) => r.status === "completed" && !!r.results?.length).sort((a, b) => b.year - a.year)[0] ?? null;

  return {
    year,
    currentSeasonRace,
    facts: getCircuitFacts(location),
    archiveCircuit,
    timeline,
    liveRaces,
    archiveRaces,
    raceForSimulation,
  };
}

/** Real, measured field-movement (average |grid - finish|) at this circuit - the one signal
 * describeTrackCharacter uses to decide "high tyre stress" rather than asserting it from nothing.
 * Exposed separately from getCircuitDetailData's own bulkier return so a caller that only needs
 * this one number (the explorer card's compact character tag, say) isn't forced to also carry the
 * full timeline/archive payload. */
export function circuitAvgFieldMovement(timeline: CircuitYearRecord[]): number | null {
  return computeRaceTrends(timeline).avgFieldMovement;
}
