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
import {
  getAllArchiveCircuits,
  getArchiveRacesByCircuitId,
  getArchiveDriverIdsByCode,
  getArchiveDriverPhotosByIds,
  type ArchiveCircuit,
  type ArchiveRaceDoc,
} from "@/lib/supabase/archive";
import { getRacesByCircuit, getRaceLaps, type RaceLapEntry } from "@/lib/supabase/races";
import { getAllCurrentDrivers, getAllCurrentTeams, type CurrentDriver, type CurrentTeam } from "@/lib/supabase/media";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { getCircuitFacts, type CircuitFacts } from "@/lib/circuitFacts";
import { buildCircuitTimeline, computeRaceTrends, computeTrackRecords, type CircuitYearRecord, type TrackRecords, type RaceTrends } from "@/lib/circuitIntelligence";
import type { RaceDoc } from "@/lib/types/race";
import { slugifyRaceName, archiveDriverHref } from "@/lib/routes";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";
import { getUserProfile } from "@/lib/supabase/users";

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

/** Resolves a `/circuits/[circuit]` URL slug back to the real, original-cased circuit string
 * every live-data lookup actually needs (`races.circuit`, e.g. "Spa-Francorchamps", "Monte
 * Carlo") - NOT a naive `slug.replace(/-/g, " ")`, which is lossy in two ways every slug this app
 * itself generates can hit: it can't tell a hyphen that came from a space apart from one that was
 * always part of the name (unslugifying "spa-francorchamps" back to "spa francorchamps" loses the
 * real hyphen), and it never recovers original casing at all ("melbourne" vs the stored
 * "Melbourne") - and `getRacesByCircuit`'s own `.eq("circuit", …)` is a case-sensitive exact
 * match, so a lowercased string silently returns zero rows for every circuit, not just the
 * hyphenated ones. Matched against this season's own real calendar - the same list circuitHref is
 * ever generated from - so this is an exact inverse for every link this app actually produces,
 * not a guess. Falls back to the naive replace only for a slug that doesn't match any current
 * round (an archive-only circuit with no live link pointing at it) - archive resolution is
 * case-insensitive already (see circuitSlug.ts's normalizeText/localityMatches), so that fallback
 * degrades gracefully rather than breaking archive-only lookups too. */
export async function resolveCircuitSlug(slug: string, year: number, uid: string): Promise<string> {
  const season = await getSeasonPageData(year, uid);
  const match = season.raceSummaries.find((r) => slugifyRaceName(r.circuit ?? r.name) === slug);
  return match?.circuit ?? match?.name ?? slug.replace(/-/g, " ");
}

export type WinnerMedia = { photoUrl: string | null; href: string | null };

/** A real profile photo + a real link to that driver's own page, for every year in a circuit's
 * Past Winners table - resolved once, in two batched queries, never one round-trip per row. An
 * archive-sourced year already carries its own archive_drivers id directly; a live-sourced year
 * (2018+, wherever `races` replaced the archive copy in buildCircuitTimeline's merge) only has the
 * winner's 3-letter code, resolved to that SAME archive id via getArchiveDriverIdsByCode - every
 * current driver has an archive_drivers row too, so this is one profile destination for any
 * winner regardless of era, not two different link targets. Prefers the current roster's own
 * headshot over the archive photo when both exist (more likely to be current), falls back to the
 * archive one otherwise - null, never a broken image, when neither source has one. */
async function buildWinnerMedia(timeline: CircuitYearRecord[]): Promise<Map<number, WinnerMedia>> {
  const withWinner = timeline.filter((r) => r.winnerDriver);
  if (withWinner.length === 0) return new Map();

  const codesNeedingLookup = [...new Set(withWinner.filter((r) => !r.winnerArchiveDriverId && r.winnerCode).map((r) => r.winnerCode as string))];
  const [currentDrivers, resolvedIds] = await Promise.all([
    getAllCurrentDrivers(),
    codesNeedingLookup.length ? getArchiveDriverIdsByCode(codesNeedingLookup) : Promise.resolve(new Map<string, string>()),
  ]);
  const currentPhotoByCode = new Map(currentDrivers.map((d) => [d.code, d.headshotUrl]));

  const archiveIdFor = (r: CircuitYearRecord): string | null => r.winnerArchiveDriverId ?? (r.winnerCode ? (resolvedIds.get(r.winnerCode) ?? null) : null);
  const idsNeedingPhoto = [...new Set(withWinner.map(archiveIdFor).filter((id): id is string => !!id))];
  const archivePhotos = idsNeedingPhoto.length ? await getArchiveDriverPhotosByIds(idsNeedingPhoto) : new Map<string, string | null>();

  const media = new Map<number, WinnerMedia>();
  for (const r of withWinner) {
    const archiveId = archiveIdFor(r);
    const currentPhoto = r.winnerCode ? (currentPhotoByCode.get(r.winnerCode) ?? null) : null;
    const archivePhoto = archiveId ? (archivePhotos.get(archiveId) ?? null) : null;
    media.set(r.year, { photoUrl: currentPhoto ?? archivePhoto, href: archiveId ? archiveDriverHref(archiveId) : null });
  }
  return media;
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
  /** Real classified position-per-lap for `raceForSimulation` - `race_laps`, written straight from
   * FastF1's own `session.laps` (see races.ts's own doc comment on getRaceLaps). This is what lets
   * the Track Experience move cars through their ACTUAL lap-by-lap positions instead of a two-point
   * grid->finish guess - empty, not fabricated, for the real minority of completed races this
   * backfill hasn't reached yet (TrackMap falls back to the honest grid/finish-only view then). */
  raceLaps: RaceLapEntry[];
  /** A real photo + profile link per winning year, keyed by year (buildCircuitTimeline already
   * dedupes to one record per year, so this is unambiguous) - see buildWinnerMedia's own comment. */
  winnerMedia: Map<number, WinnerMedia>;
  /** The current roster's own real headshots/logos - for the classification table, which needs a
   * real photo per row (matching the Season page's own Championship table), not just a team-color
   * dot. Passed as the raw list rather than a pre-built map so a client component can memoize its
   * own lookup only if it actually needs one. */
  currentDrivers: CurrentDriver[];
  currentTeams: CurrentTeam[];
};

/** `location` is the exact string this app already routes circuits by (circuitHref's own query
 * param - FastF1's own `circuit`/`location` field, e.g. "Melbourne") - not a new slug format, the
 * one every existing link into this section already produces. Returns null only when NEITHER the
 * live `races` table nor the archive has ever recorded anything at this location - a genuinely
 * unknown circuit, not a data gap in one specific source. */
export async function getCircuitDetailData(location: string, year: number, uid: string): Promise<CircuitDetailData | null> {
  const [season, liveRaces, allCircuits, currentDrivers, currentTeams] = await Promise.all([
    getSeasonPageData(year, uid),
    getRacesByCircuit(location),
    getAllArchiveCircuits(),
    getAllCurrentDrivers(),
    getAllCurrentTeams(),
  ]);

  const currentSeasonRace = season.raceSummaries.find((r) => (r.circuit ?? "").toLowerCase() === location.toLowerCase()) ?? null;

  const circuitLocalities = new Map(allCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
  const archiveId = resolveCurrentCircuitToArchiveId(location, circuitLocalities);
  const archiveCircuit = archiveId ? (allCircuits.find((c) => c.circuitId === archiveId) ?? null) : null;
  const archiveRaces = archiveId ? await getArchiveRacesByCircuitId(archiveId) : [];

  if (liveRaces.length === 0 && archiveRaces.length === 0 && !currentSeasonRace) return null;

  const timeline = buildCircuitTimeline(liveRaces, archiveRaces);
  const raceForSimulation = [...liveRaces].filter((r) => r.status === "completed" && !!r.results?.length).sort((a, b) => b.year - a.year)[0] ?? null;
  const raceLaps = raceForSimulation ? await getRaceLaps(raceForSimulation.year, raceForSimulation.round) : [];
  const winnerMedia = await buildWinnerMedia(timeline);

  return {
    year,
    currentSeasonRace,
    facts: getCircuitFacts(location),
    archiveCircuit,
    timeline,
    liveRaces,
    archiveRaces,
    raceForSimulation,
    raceLaps,
    winnerMedia,
    currentDrivers,
    currentTeams,
  };
}

export type PersonalDriverHistory = { code: string; name: string; races: number; wins: number; bestFinish: number | null };
export type PersonalTeamHistory = { name: string; races: number; wins: number; podiums: number };

export type CircuitInsightsData = {
  location: string;
  timelineYears: number;
  trackRecords: TrackRecords;
  raceTrends: RaceTrends;
  /** Real career-at-this-circuit stats for the signed-in user's OWN favourite drivers - resolved
   * from the session server-side (never trusted from the client), and every one of them, not just
   * favourites[0] - see the Circuits homepage's own personalization requirement. Empty, not
   * rendered at all by the caller, when the user has no favourite drivers or none of them have
   * ever raced here. */
  personalDrivers: PersonalDriverHistory[];
  personalTeams: PersonalTeamHistory[];
};

function archiveIsClassified(status: string): boolean {
  return status === "Finished" || /^\+\d+ Lap/.test(status);
}

/** The deterministic (non-LLM) half of Circuit Intelligence for the homepage's selected-circuit
 * focus panel - real computed records/trends (computeTrackRecords/computeRaceTrends, the exact
 * same functions the circuit detail page's own Track Intelligence section already uses) plus a
 * personal "your history here" overlay, all from ONE lightweight fetch. Deliberately NOT
 * getCircuitDetailData - that function also fetches race laps, winner media, and the full current
 * roster for the detail page's own richer sections, none of which this compact panel needs, and
 * selecting a new circuit on the homepage happens far more often (every click) than opening the
 * full detail page. */
export async function getCircuitInsightsData(location: string, year: number, uid: string): Promise<CircuitInsightsData | null> {
  const [liveRaces, allCircuits, profile] = await Promise.all([getRacesByCircuit(location), getAllArchiveCircuits(), getUserProfile(uid)]);

  const circuitLocalities = new Map(allCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
  const archiveId = resolveCurrentCircuitToArchiveId(location, circuitLocalities);
  const archiveRaces = archiveId ? await getArchiveRacesByCircuitId(archiveId) : [];
  if (liveRaces.length === 0 && archiveRaces.length === 0) return null;

  const timeline = buildCircuitTimeline(liveRaces, archiveRaces);

  const favoriteDrivers = profile?.favoriteDrivers ?? [];
  const favoriteTeams = profile?.favoriteTeams ?? [];

  const personalDrivers: PersonalDriverHistory[] = favoriteDrivers.map((code) => {
    let races = 0;
    let wins = 0;
    let bestFinish: number | null = null;
    let name = code;
    for (const race of liveRaces) {
      const r = race.results?.find((res) => res.driver === code);
      if (!r) continue;
      races += 1;
      name = r.driverName;
      if (r.status !== "dnf") {
        if (r.finishPosition === 1) wins += 1;
        bestFinish = bestFinish === null ? r.finishPosition : Math.min(bestFinish, r.finishPosition);
      }
    }
    for (const race of archiveRaces) {
      const r = race.results.find((res) => res.driverCode === code);
      if (!r) continue;
      races += 1;
      name = r.driverName;
      if (archiveIsClassified(r.status)) {
        if (r.position === 1) wins += 1;
        bestFinish = bestFinish === null ? r.position : Math.min(bestFinish, r.position);
      }
    }
    return { code, name, races, wins, bestFinish };
  });

  const personalTeams: PersonalTeamHistory[] = favoriteTeams.map((teamName) => {
    let races = 0;
    let wins = 0;
    let podiums = 0;
    const archiveTeamId = archiveSlugForCurrentTeam(teamName);
    for (const race of liveRaces) {
      for (const r of race.results ?? []) {
        if (r.team !== teamName) continue;
        races += 1;
        if (r.status === "dnf") continue;
        if (r.finishPosition === 1) wins += 1;
        if (r.finishPosition <= 3) podiums += 1;
      }
    }
    for (const race of archiveRaces) {
      for (const r of race.results) {
        if (r.teamId !== archiveTeamId) continue;
        races += 1;
        if (!archiveIsClassified(r.status)) continue;
        if (r.position === 1) wins += 1;
        if (r.position <= 3) podiums += 1;
      }
    }
    return { name: teamName, races, wins, podiums };
  });

  return {
    location,
    timelineYears: timeline.length,
    trackRecords: computeTrackRecords(timeline),
    raceTrends: computeRaceTrends(timeline),
    personalDrivers: personalDrivers.filter((d) => d.races > 0),
    personalTeams: personalTeams.filter((t) => t.races > 0),
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
