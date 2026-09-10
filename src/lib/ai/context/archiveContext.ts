// Archive Intelligence context builder - same RaceIntelligenceContext contract raceContext.ts
// produces, sourced from `archive_races` instead of the live `races` table. Kept a separate file
// (not branching inside raceContext.ts) because the two source rows genuinely don't share a shape:
// ArchiveRaceDoc has no tireCompoundPace/safetyCarPeriods/trafficStats at all, its weather/results
// fields are differently shaped, and drivers/teams are matched by archive id, not this season's
// short code. Same rule as raceContext.ts: only this file touches Supabase or computes analytics
// for the archive side of this feature.
//
// Because the schema/prompt/orchestrator/cache/UI all consume RaceIntelligenceContext, not "where
// it came from," none of that machinery needed to change for archive races to get real coverage -
// only this builder and the route's source dispatch (see route.ts).

import { computeMoments, type Moment } from "@/lib/raceMoments";
import { parseTimeToSeconds } from "@/lib/parseTimeToSeconds";
import { getFavoriteDriverCard, getFavoriteTeamCard, getTrackHistory, type FavoriteDriverCard, type FavoriteTeamCard } from "@/lib/personalization";
import { getArchiveRace, getArchiveRaceLaps, getArchiveSeason, type ArchiveRaceDoc, type ArchiveResultEntry } from "@/lib/supabase/archive";
import { getUserProfile } from "@/lib/supabase/users";
import type { EvidenceFact, RaceIntelligenceContext } from "./raceContext";

// "Finished" / "+N Lap(s)" count as classified; anything else is a retirement - same free-text
// classification ArchiveRaceDashboard.tsx's own isRetired already uses (archive status has no enum).
function isRetired(status: string): boolean {
  return !(status === "Finished" || /^\+\d+ Lap/.test(status));
}

function accumulateStandings(races: ArchiveRaceDoc[], throughRound: number): { driverId: string | null; driverName: string | null; team: string | null } {
  const driverPoints = new Map<string, { name: string; points: number }>();
  const teamPoints = new Map<string, number>();
  for (const race of races) {
    if (race.round > throughRound) continue;
    for (const r of race.results) {
      const d = driverPoints.get(r.driverId) ?? { name: r.driverName, points: 0 };
      d.points += r.points;
      d.name = r.driverName;
      driverPoints.set(r.driverId, d);
      teamPoints.set(r.constructor, (teamPoints.get(r.constructor) ?? 0) + r.points);
    }
  }
  const topDriver = [...driverPoints.entries()].sort((a, b) => b[1].points - a[1].points)[0];
  const topTeam = [...teamPoints.entries()].sort((a, b) => b[1] - a[1])[0];
  return { driverId: topDriver?.[0] ?? null, driverName: topDriver?.[1].name ?? null, team: topTeam?.[0] ?? null };
}

function findResult(results: ArchiveResultEntry[], driverId: string): ArchiveResultEntry | undefined {
  return results.find((r) => r.driverId === driverId);
}

export async function buildArchiveIntelligenceContext(year: number, round: number, userId?: string): Promise<RaceIntelligenceContext> {
  const race = await getArchiveRace(year, round);
  if (!race) throw new Error(`buildArchiveIntelligenceContext(${year}, ${round}): race not found`);

  const results = race.results;
  const winnerRow = results.find((r) => r.position === 1);
  const podiumRows = results.filter((r) => r.position <= 3).sort((a, b) => a.position - b.position);
  const dnfCount = results.filter((r) => isRetired(r.status)).length;
  const fastestRow = results.find((r) => r.fastestLap?.rank === 1);

  // The four blocks below (championship, key moments, track history, personal favorites) are
  // mutually independent - none reads another's result, only `year`/`round`/`race`/`userId`
  // (already in hand). Previously four SEQUENTIAL awaits sitting entirely before this route's
  // cache check can even run (real, measured contributor to cache-hit latency). Running them
  // concurrently doesn't change what's fetched or how errors are handled - only when.
  const [{ driverLeaderChanged, constructorLeaderChanged, after }, keyMoments, trackHistory, personalCards] = await Promise.all([
    // Championship impact - accumulated locally from getArchiveSeason(year), not
    // computeSeasonStandings (that reads the live `races` table, which has nothing for a
    // historical year) - same "leader through round N vs. N-1" comparison, adapted to archive's
    // own id/points shape (driverId/constructor, not this season's short code).
    (async () => {
      const season = await getArchiveSeason(year);
      const before = accumulateStandings(season, round - 1);
      const after = accumulateStandings(season, round);
      return {
        driverLeaderChanged: before.driverId !== after.driverId && after.driverId !== null,
        constructorLeaderChanged: before.team !== after.team && after.team !== null,
        after,
      };
    })(),

    (async (): Promise<Moment[]> => {
      try {
        const laps = await getArchiveRaceLaps(year, round);
        const nameByCode = new Map(results.map((r) => [r.driverId, r.driverName]));
        return computeMoments(laps, (id) => nameByCode.get(id) ?? id);
      } catch {
        return []; // pre-1996 races and any `!lapsBackfilled` row genuinely have no lap data
      }
    })(),

    // Archive rows already carry their own resolved circuit id - no name-based resolution needed
    // (that's raceContext.ts's own workaround for the live `races` table having no circuit_id).
    race.circuitId ? getTrackHistory(race.circuitId).catch(() => null) : Promise.resolve(null),

    // Matched by real archive id (driverId/teamId), not this season's short code - archive
    // results are keyed by Ergast-style ids, never a current-season code.
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
  const { favoriteDriver, favoriteTeam } = personalCards;

  const evidenceFacts: EvidenceFact[] = [];
  if (winnerRow) {
    evidenceFacts.push({ id: "classification-winner", source: "classification", fact: `${winnerRow.driverName} won the race.` });
    const second = results.find((r) => r.position === 2);
    // parseTimeToSeconds on a result's own `time` is only safe for the immediate runner-up's gap
    // (a real "+N.NNN" figure) - same restriction circuitIntelligence.ts's own margin computation
    // documents; no other result's `time` is treated as a number anywhere in this file.
    const marginSec = second ? parseTimeToSeconds(second.time) : null;
    if (second && marginSec !== null) {
      evidenceFacts.push({ id: "classification-margin", source: "classification", fact: `${winnerRow.driverName} won by ${marginSec.toFixed(3)}s over ${second.driverName}.` });
    }
  }
  if (podiumRows.length) {
    evidenceFacts.push({ id: "classification-podium", source: "classification", fact: `Podium: ${podiumRows.map((r) => `P${r.position} ${r.driverName}`).join(", ")}.` });
  }
  if (dnfCount > 0) {
    evidenceFacts.push({ id: "classification-dnf", source: "classification", fact: `${dnfCount} car${dnfCount === 1 ? "" : "s"} failed to finish.` });
  }
  const fastestLapSec = fastestRow?.fastestLap ? parseTimeToSeconds(fastestRow.fastestLap.time) : null;
  if (fastestRow && fastestLapSec !== null) {
    evidenceFacts.push({ id: "classification-fastest-lap", source: "classification", fact: `${fastestRow.driverName} set the fastest lap.` });
  }
  if (driverLeaderChanged) {
    evidenceFacts.push({ id: "championship-driver-leader-change", source: "championship", fact: `${after.driverName} became the new championship leader.` });
  }
  if (constructorLeaderChanged) {
    evidenceFacts.push({ id: "championship-constructor-leader-change", source: "championship", fact: `${after.team} became the new constructors' championship leader.` });
  }
  if (race.weather) {
    const w = race.weather;
    evidenceFacts.push({ id: "weather-conditions", source: "weather", fact: `${w.precipitationMm > 0 ? "Wet" : "Dry"} conditions, ${w.tempMinC}-${w.tempMaxC}C.` });
  }
  // No tire-compound data pre-dates this app's own telemetry pipeline - pit stop count is the real,
  // archive-native equivalent of "strategy" this era's data actually supports.
  if (race.pitStops && race.pitStops.length > 0) {
    evidenceFacts.push({ id: "tire-strategy-summary", source: "tireStrategy", fact: `${race.pitStops.length} pit stops recorded across the field.` });
  }
  for (const m of keyMoments) {
    evidenceFacts.push({ id: `key-moment-lap-${m.lap}-${evidenceFacts.length}`, source: "keyMoments", fact: `Lap ${m.lap}: ${m.text}` });
  }
  if (trackHistory) {
    if (trackHistory.topPerformer) evidenceFacts.push({ id: "track-history-top-performer", source: "trackHistory", fact: `${trackHistory.topPerformer.driverName} has the most wins at this circuit (${trackHistory.topPerformer.wins}).` });
    if (trackHistory.defendingWinner) evidenceFacts.push({ id: "track-history-defending-winner", source: "trackHistory", fact: `${trackHistory.defendingWinner.driverName} won the most recent race held here (${trackHistory.defendingWinner.year}).` });
  }
  if (favoriteDriver) {
    const row = findResult(results, favoriteDriver.driverId);
    if (row) evidenceFacts.push({ id: "favorite-driver-result", source: "favoriteDriver", fact: `${favoriteDriver.name} finished P${row.position} for ${row.constructor}.` });
  }
  if (favoriteTeam) {
    const rows = results.filter((r) => (r.teamId ? r.teamId === favoriteTeam!.teamId : r.constructor === favoriteTeam!.name));
    if (rows.length) evidenceFacts.push({ id: "favorite-team-result", source: "favoriteTeam", fact: `${favoriteTeam.name}: ${rows.map((r) => `P${r.position} ${r.driverName}`).join(", ")}.` });
  }

  // compoundPace/traffic/safetyCar: genuinely absent from archive_races (no such columns exist for
  // any historical year) - honestly false, not fabricated, same "some sources legitimately
  // unavailable" case raceContext.ts's own dataCoverage comment describes for an OpenF1-fallback
  // live race.
  const dataCoverage: RaceIntelligenceContext["dataCoverage"] = {
    classification: results.length > 0,
    championship: driverLeaderChanged || constructorLeaderChanged,
    weather: !!race.weather,
    tireStrategy: !!(race.pitStops && race.pitStops.length > 0),
    compoundPace: false,
    traffic: false,
    safetyCar: false,
    keyMoments: keyMoments.length > 0,
    trackHistory: !!trackHistory,
    favoriteDriver: !!favoriteDriver,
    favoriteTeam: !!favoriteTeam,
  };

  return {
    race: { name: race.raceName, round: race.round, season: race.year, circuitName: race.circuitName ?? "Unknown circuit", date: race.raceDate ?? null, status: "completed" },
    classification: {
      winner: winnerRow ? { driver: winnerRow.driverId, driverName: winnerRow.driverName } : null,
      podium: podiumRows.map((r) => ({ driver: r.driverId, driverName: r.driverName, position: r.position })),
      dnfCount,
      fastestLap: fastestRow && fastestLapSec !== null ? { driver: fastestRow.driverId, driverName: fastestRow.driverName, timeSec: fastestLapSec } : null,
    },
    standingsImpact: {
      driverLeaderChanged,
      newDriverLeader: driverLeaderChanged ? after.driverName : null,
      constructorLeaderChanged,
      newConstructorLeader: constructorLeaderChanged ? after.team : null,
    },
    // Raw passthrough fields kept null/empty for archive - nothing downstream (prompt, orchestrator,
    // fallback) reads them directly, only evidenceFacts/dataCoverage above, and archive's own
    // weather/pitStops shapes genuinely don't match RaceDoc's types these fields are typed against.
    weather: null,
    tireStrategy: [],
    tireCompoundPace: null,
    safetyCarPeriods: null,
    trafficStats: null,
    keyMoments,
    trackHistory,
    favoriteDriver,
    favoriteTeam,
    evidenceFacts,
    dataCoverage,
  };
}
