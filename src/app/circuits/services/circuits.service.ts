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
import { chooseLayout, circuitEras, displayLayout, layoutToDrawing, seasonLabel, type CircuitDrawing, type CircuitLayout } from "@/lib/circuitLayout";
import { getCircuitLayouts, getRaceLayout } from "@/lib/supabase/circuitLayouts";
import { getRaceTrackStory, getRaceTrackStoryByRound } from "@/lib/supabase/raceTrackStories";
import { replayFor, type ReplayEntry } from "@/lib/replayManifest";
import type { RaceTrackStory } from "@/lib/raceTrackStory";
import type { CircuitExtras } from "@/lib/ai/context/circuitContext";

export type CircuitExplorerEntry = {
  race: RaceSummary;
  facts: CircuitFacts | null;
  /** The circuit as raced this season, from the track library - null when the library has nothing for it. */
  drawing: CircuitDrawing | null;
  /** This round's traced track story (lead changes), for its storyline - completed rounds only. */
  story: RaceTrackStory | null;
  /** Whether this round has a replay (its circuit page plays it). */
  hasReplay: boolean;
  /** Days from now to race day (negative once past), for the storyline of a round still to come. */
  daysToGo: number | null;
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
  const [season, allCircuits] = await Promise.all([getSeasonPageData(year, uid), getAllArchiveCircuits()]);
  const localities = new Map(allCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
  const entries: CircuitExplorerEntry[] = await Promise.all(
    season.raceSummaries.map(async (race) => {
      const archiveId = race.circuit ? resolveCurrentCircuitToArchiveId(race.circuit, localities) : null;
      const [found, story] = await Promise.all([
        getRaceLayout({ circuitId: archiveId, circuitName: race.circuit ?? null, year, raceName: race.name }),
        race.state === "completed" ? getRaceTrackStoryByRound(year, race.round) : Promise.resolve(null),
      ]);
      // The same choice the circuit's own page makes (displayLayout), so a card is never blank where the page has a
      // drawing: this season's layout, else the circuit as last raced.
      const layout = found ?? displayLayout(await getCircuitLayouts({ circuitId: archiveId, circuitName: race.circuit ?? null }), year, race.name);
      return {
        race,
        facts: getCircuitFacts(race.circuit ?? ""),
        drawing: layout ? layoutToDrawing(layout) : null,
        story,
        hasReplay: race.state === "completed" && replayFor(year, race.round) !== null,
        daysToGo: race.raceDate ? Math.round((new Date(`${race.raceDate.slice(0, 10)}T12:00:00Z`).getTime() - Date.now()) / 86_400_000) : null,
      };
    }),
  );
  const nextRound = season.raceSummaries.find((r) => r.state === "next")?.round ?? null;
  return {
    year,
    entries,
    completedCount: season.racesCompleted,
    remainingCount: season.racesRemaining,
    nextRound,
  };
}

/** Resolves a `/circuits?circuit=` URL slug back to the real, original-cased circuit string
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
  /** Every era of this circuit, oldest first, each as a ready drawing (drawn history plus measured layouts). */
  eras: { layout: CircuitLayout; drawing: CircuitDrawing }[];
  /** The head's drawing: displayLayout, the same choice the circuits home makes for this circuit's card. */
  heroDrawing: CircuitDrawing | null;
  /** The traced story of `raceForSimulation` (where its lead changes happened), when it has one. */
  trackStory: RaceTrackStory | null;
  /** The layout `raceForSimulation` was run on, for its circuit view when it has no traced story. */
  raceLayout: CircuitLayout | null;
  /** The replay of this season's race here - only the current season's races have one. */
  replay: ReplayEntry | null;
  /** Days from now to this season's race here (negative once past), null without a date. */
  daysToGo: number | null;
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
  const [raceLaps, winnerMedia, layouts, trackStory] = await Promise.all([
    raceForSimulation ? getRaceLaps(raceForSimulation.year, raceForSimulation.round) : Promise.resolve([]),
    buildWinnerMedia(timeline),
    getCircuitLayouts({ circuitId: archiveId, circuitName: location }),
    raceForSimulation ? getRaceTrackStory(raceForSimulation.id) : Promise.resolve(null),
  ]);
  const eras = circuitEras(layouts).map((layout) => ({ layout, drawing: layoutToDrawing(layout) }));
  const raceLayout = raceForSimulation ? chooseLayout(layouts, raceForSimulation.year, raceForSimulation.name) : null;
  // The head's drawing, chosen exactly as the circuits home chooses its card's (displayLayout).
  const heroLayout = displayLayout(layouts, year, currentSeasonRace?.name ?? raceForSimulation?.name ?? "");
  // Replays are for the current season's races only (older seasons' are retired at the season changeover).
  const replay = raceForSimulation && raceForSimulation.year === year ? replayFor(raceForSimulation.year, raceForSimulation.round) : null;

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
    eras,
    heroDrawing: heroLayout ? layoutToDrawing(heroLayout) : null,
    trackStory,
    raceLayout,
    replay,
    daysToGo: currentSeasonRace?.raceDate ? Math.round((new Date(`${currentSeasonRace.raceDate.slice(0, 10)}T12:00:00Z`).getTime() - Date.now()) / 86_400_000) : null,
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

/** The circuit take's extras (see CircuitExtras): this season's form for a round still to come, the layout history,
 * and where the lead changed hands in this season's race here. Built from what getCircuitDetailData already loaded,
 * plus the season's standings (cached). */
export async function getCircuitTakeExtras(data: CircuitDetailData, uid: string): Promise<CircuitExtras> {
  const { year, currentSeasonRace, raceForSimulation, trackStory, eras } = data;
  const layouts = eras.filter((e) => !e.layout.raceNameMatch).map((e) => seasonLabel(e.layout.seasons));

  let form: CircuitExtras["form"] = null;
  if (currentSeasonRace && currentSeasonRace.state !== "completed") {
    const season = await getSeasonPageData(year, uid);
    form = {
      leaders: season.drivers.slice(0, 3).map((d) => ({ name: d.driverName, team: d.team, points: d.points, wins: d.wins })),
      recentWinners: season.raceSummaries
        .filter((r) => r.state === "completed" && r.winnerName)
        .slice(-3)
        .map((r) => `${r.name}: ${r.winnerName}`),
    };
  }

  let leadChanges: CircuitExtras["leadChanges"] = null;
  if (trackStory && raceForSimulation && raceForSimulation.year === year) {
    const name = (code: string) => raceForSimulation.results?.find((r) => r.driver === code)?.driverName ?? code;
    const changes = trackStory.leadChanges;
    const last = [...changes].reverse().find((c) => c.kind === "pass");
    leadChanges = {
      lastPass: last && last.kind === "pass" ? { lap: last.lap, by: name(last.to), from: name(last.from), near: last.near } : null,
      total: changes.length,
      onTrack: changes.filter((c) => c.kind === "pass").length,
      inPits: changes.filter((c) => c.kind === "pit").length,
      lines: changes.map((c) =>
        c.kind === "pass"
          ? `from lap ${c.lap}, ${name(c.to)} leads (passed ${name(c.from)} on track${c.near ? `, ${c.near}` : ""})`
          : `from lap ${c.lap}, ${name(c.to)} leads (${name(c.from)} lost the lead in the pit stops)`,
      ),
    };
  }
  return { form, layouts, leadChanges };
}
