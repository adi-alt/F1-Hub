// Composes archive.ts + media.ts + races.ts into the two things the personalized homepage needs:
// "what does this favorite look like right now" (favorite driver/team/track cards, with a real
// current photo when the entity is still active) and "what's actually true about this season so
// far" (standings computed from real race_results, not invented). Deliberately its own module,
// not folded into lib/supabase/* — same role src/lib/highlights.ts and predictionAccuracy.ts
// already have: a derived view-model layer on top of the data layer, not a data source itself.

import { getArchiveCircuit, getArchiveDriver, getArchiveRacesByCircuitId, getArchiveTeam } from "@/lib/supabase/archive";
import { getAllCurrentTeams, getCurrentDriver } from "@/lib/supabase/media";
import { getRacesByCircuit, getRacesByYear } from "@/lib/supabase/races";
import { archiveCircuitHref, archiveDriverHref, archiveTeamHref } from "@/lib/routes";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";
import type { RaceDoc } from "@/lib/types/race";

export type FavoriteDriverCard = {
  driverId: string;
  name: string;
  code: string | null; // this season's race_results.driver key, for matching against SeasonStandings
  team: string | null;
  headshotUrl: string | null;
  isActiveThisSeason: boolean;
  raceCount: number;
  firstYear: number;
  lastYear: number;
  href: string;
};

export type FavoriteTeamCard = {
  teamId: string;
  name: string;
  currentName: string | null; // this season's race_results.team key, for matching against SeasonStandings
  color: string | null;
  logoUrl: string | null;
  isActiveThisSeason: boolean;
  raceCount: number;
  firstYear: number;
  lastYear: number;
  href: string;
};

export type FavoriteTrackCard = {
  circuitId: string;
  name: string;
  imageUrl: string | null;
  href: string;
};

export async function getFavoriteDriverCard(driverId: string): Promise<FavoriteDriverCard | null> {
  const archiveDriver = await getArchiveDriver(driverId);
  if (!archiveDriver) return null;
  const current = archiveDriver.code ? await getCurrentDriver(archiveDriver.code) : null;
  return {
    driverId,
    name: archiveDriver.name,
    code: archiveDriver.code,
    team: current?.team ?? archiveDriver.constructors?.at(-1) ?? null,
    headshotUrl: current?.headshotUrl ?? null,
    isActiveThisSeason: !!current,
    raceCount: archiveDriver.raceCount,
    firstYear: archiveDriver.firstYear,
    lastYear: archiveDriver.lastYear,
    href: archiveDriverHref(driverId),
  };
}

export async function getFavoriteTeamCard(teamId: string): Promise<FavoriteTeamCard | null> {
  const archiveTeam = await getArchiveTeam(teamId);
  if (!archiveTeam) return null;
  const currentTeams = await getAllCurrentTeams();
  const current = currentTeams.find((t) => archiveSlugForCurrentTeam(t.name) === teamId);
  return {
    teamId,
    name: archiveTeam.name,
    currentName: current?.name ?? null,
    color: current?.color ?? null,
    logoUrl: current?.logoUrl ?? null,
    isActiveThisSeason: !!current,
    raceCount: archiveTeam.raceCount,
    firstYear: archiveTeam.firstYear,
    lastYear: archiveTeam.lastYear,
    href: archiveTeamHref(teamId),
  };
}

export async function getFavoriteTrackCard(circuitId: string): Promise<FavoriteTrackCard | null> {
  const circuit = await getArchiveCircuit(circuitId);
  if (!circuit) return null;
  return { circuitId, name: circuit.name ?? circuitId, imageUrl: circuit.imageUrl, href: archiveCircuitHref(circuitId) };
}

export type DriverStanding = { driver: string; driverName: string; team: string; points: number; wins: number; podiums: number };
export type TeamStanding = { team: string; points: number };

export type SeasonStandings = {
  drivers: DriverStanding[]; // sorted by points desc
  teams: TeamStanding[]; // sorted by points desc
  poleCounts: Record<string, number>; // driver -> pole count
};

/** Computed straight from this season's real race_results/pole_sitter, not a stored standings
 * table (there isn't one — the championship table itself is just points summed over races, cheap
 * enough to derive on every homepage render rather than maintain as its own denormalized state). */
export async function computeSeasonStandings(year: number): Promise<SeasonStandings> {
  const races = await getRacesByYear(year);
  const driverMap = new Map<string, DriverStanding>();
  const teamMap = new Map<string, number>();
  const poleCounts: Record<string, number> = {};

  for (const race of races) {
    if (race.status !== "completed") continue;
    for (const r of race.results ?? []) {
      const d = driverMap.get(r.driver) ?? { driver: r.driver, driverName: r.driverName, team: r.team, points: 0, wins: 0, podiums: 0 };
      d.points += r.points;
      d.team = r.team; // most recent team this driver raced for, in case of a mid-season swap
      if (r.finishPosition === 1) d.wins += 1;
      if (r.finishPosition <= 3) d.podiums += 1;
      driverMap.set(r.driver, d);
      teamMap.set(r.team, (teamMap.get(r.team) ?? 0) + r.points);
    }
    if (race.poleSitter) poleCounts[race.poleSitter] = (poleCounts[race.poleSitter] ?? 0) + 1;
  }

  return {
    drivers: [...driverMap.values()].sort((a, b) => b.points - a.points),
    teams: [...teamMap.entries()].map(([team, points]) => ({ team, points })).sort((a, b) => b.points - a.points),
    poleCounts,
  };
}

export type TrackTopPerformer = { driverId: string; driverName: string; wins: number; photoUrl: string | null; href: string };
export type TrackTopPodiumDriver = { driverId: string; driverName: string; podiums: number; photoUrl: string | null; href: string };
export type TrackYoungestWinner = { driverId: string; driverName: string; year: number; ageYears: number; photoUrl: string | null; href: string };
export type TrackTopCurrentTeam = { name: string; wins: number; logoUrl: string | null; color: string | null };
export type TrackDefendingWinner = { driverId: string; driverName: string; year: number; photoUrl: string | null; href: string };

export type DriverCircuitStats = {
  driverId: string;
  driverName: string;
  appearances: number;
  wins: number;
  podiums: number;
  bestFinish: number | null;
  avgFinish: number | null;
};

export type TeamCircuitStats = {
  teamId: string;
  appearances: number;
  wins: number;
  podiums: number;
  bestFinish: number | null;
};

export type TrackHistory = {
  circuitId: string;
  circuitImageUrl: string | null;
  circuitImageUrls: string[] | null;
  totalRaces: number;
  firstYear: number;
  lastYear: number;
  topPerformer: TrackTopPerformer | null;
  topPodiumDriver: TrackTopPodiumDriver | null;
  youngestWinner: TrackYoungestWinner | null;
  topCurrentTeam: TrackTopCurrentTeam | null;
  favoriteDriverCircuitStats?: DriverCircuitStats | null;
  favoriteTeamCircuitStats?: TeamCircuitStats | null;
  /** The winner of the most recent race run at this circuit — real, not "reigning champion"
   * (that's a season-wide title, unrelated to who actually won here last). */
  defendingWinner: TrackDefendingWinner | null;
};

function ageInYears(birthDateIso: string, onDateIso: string): number {
  const birth = new Date(birthDateIso);
  const on = new Date(onDateIso);
  let age = on.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear = on.getMonth() > birth.getMonth() || (on.getMonth() === birth.getMonth() && on.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/** Everything the homepage's track-history section needs for the upcoming race's circuit, in one
 * call. Null if the archive doesn't have this circuit at all yet (a genuinely new-to-the-calendar
 * track) or has no classified winners on record. driver lookups (getArchiveDriver) are per-race,
 * not deduplicated by driver first — acceptable at this scale (a circuit's raced at most ~75
 * times) and each call is `unstable_cache`-backed anyway, so a repeat winner's second lookup
 * doesn't re-hit Postgres. */
export async function getTrackHistory(
  circuitId: string,
  options?: { favoriteDriverId?: string; favoriteTeamId?: string }
): Promise<TrackHistory | null> {
  const races = await getArchiveRacesByCircuitId(circuitId);
  if (races.length === 0) return null;

  const winsByDriver = new Map<string, { driverName: string; wins: number }>();
  const podiumsByDriver = new Map<string, { driverName: string; podiums: number }>();
  const winsByTeamId = new Map<string, number>();
  let youngestWinner: TrackYoungestWinner | null = null;
  let minAgeYears = Infinity;

  for (const race of races) {
    const winner = race.results.find((r) => r.position === 1);
    if (winner) {
      const existing = winsByDriver.get(winner.driverId) ?? { driverName: winner.driverName, wins: 0 };
      existing.wins += 1;
      winsByDriver.set(winner.driverId, existing);

      if (winner.teamId) winsByTeamId.set(winner.teamId, (winsByTeamId.get(winner.teamId) ?? 0) + 1);

      if (race.raceDate) {
        const driverInfo = await getArchiveDriver(winner.driverId);
        if (driverInfo?.dateOfBirth) {
          const age = ageInYears(driverInfo.dateOfBirth, race.raceDate);
          if (age < minAgeYears) {
            minAgeYears = age;
            youngestWinner = {
              driverId: winner.driverId,
              driverName: winner.driverName,
              year: race.year,
              ageYears: age,
              photoUrl: driverInfo.photoUrl,
              href: archiveDriverHref(winner.driverId),
            };
          }
        }
      }
    }

    for (const res of race.results) {
      if (res.position && res.position <= 3) {
        const pExisting = podiumsByDriver.get(res.driverId) ?? { driverName: res.driverName, podiums: 0 };
        pExisting.podiums += 1;
        podiumsByDriver.set(res.driverId, pExisting);
      }
    }
  }

  let topPerformer: TrackTopPerformer | null = null;
  const topEntry = [...winsByDriver.entries()].sort((a, b) => b[1].wins - a[1].wins)[0];
  if (topEntry) {
    const [driverId, info] = topEntry;
    const driverInfo = await getArchiveDriver(driverId);
    topPerformer = { driverId, driverName: info.driverName, wins: info.wins, photoUrl: driverInfo?.photoUrl ?? null, href: archiveDriverHref(driverId) };
  }

  let topPodiumDriver: TrackTopPodiumDriver | null = null;
  const topPodiumEntry = [...podiumsByDriver.entries()].sort((a, b) => b[1].podiums - a[1].podiums)[0];
  if (topPodiumEntry) {
    const [driverId, info] = topPodiumEntry;
    const driverInfo = await getArchiveDriver(driverId);
    topPodiumDriver = {
      driverId,
      driverName: info.driverName,
      podiums: info.podiums,
      photoUrl: driverInfo?.photoUrl ?? null,
      href: archiveDriverHref(driverId),
    };
  }

  let topCurrentTeam: TrackTopCurrentTeam | null = null;
  const currentTeams = await getAllCurrentTeams();
  for (const team of currentTeams) {
    const wins = winsByTeamId.get(archiveSlugForCurrentTeam(team.name)) ?? 0;
    if (wins > 0 && (!topCurrentTeam || wins > topCurrentTeam.wins)) {
      topCurrentTeam = { name: team.name, wins, logoUrl: team.logoUrl, color: team.color };
    }
  }

  const circuit = await getArchiveCircuit(circuitId);

  const lastRace = races.at(-1)!;
  const lastRaceWinner = lastRace.results.find((r) => r.position === 1);
  const defendingWinner: TrackDefendingWinner | null = lastRaceWinner
    ? {
        driverId: lastRaceWinner.driverId,
        driverName: lastRaceWinner.driverName,
        year: lastRace.year,
        photoUrl: (await getArchiveDriver(lastRaceWinner.driverId))?.photoUrl ?? null,
        href: archiveDriverHref(lastRaceWinner.driverId),
      }
    : null;

  // Optional personal circuit stats
  let favoriteDriverCircuitStats: DriverCircuitStats | null = null;
  if (options?.favoriteDriverId) {
    favoriteDriverCircuitStats = await getDriverCircuitStats(options.favoriteDriverId, circuitId);
  }

  let favoriteTeamCircuitStats: TeamCircuitStats | null = null;
  if (options?.favoriteTeamId) {
    favoriteTeamCircuitStats = await getTeamCircuitStats(options.favoriteTeamId, circuitId);
  }

  return {
    circuitId,
    circuitImageUrl: circuit?.imageUrl ?? null,
    circuitImageUrls: circuit?.imageUrls ?? null,
    totalRaces: races.length,
    firstYear: races[0].year,
    lastYear: races.at(-1)!.year,
    topPerformer,
    topPodiumDriver,
    youngestWinner,
    topCurrentTeam,
    defendingWinner,
    favoriteDriverCircuitStats,
    favoriteTeamCircuitStats,
  };
}

export async function getDriverCircuitStats(driverId: string, circuitId: string): Promise<DriverCircuitStats | null> {
  const races = await getArchiveRacesByCircuitId(circuitId);
  if (races.length === 0) return null;

  let appearances = 0;
  let wins = 0;
  let podiums = 0;
  let bestFinish: number | null = null;
  let sumFinish = 0;
  let classifiedCount = 0;
  let driverName = "";

  for (const race of races) {
    const res = race.results.find((r) => r.driverId === driverId);
    if (!res) continue;
    appearances++;
    driverName = res.driverName || driverName;
    if (res.position) {
      if (bestFinish === null || res.position < bestFinish) bestFinish = res.position;
      sumFinish += res.position;
      classifiedCount++;
      if (res.position === 1) wins++;
      if (res.position <= 3) podiums++;
    }
  }

  if (appearances === 0) return null;

  return {
    driverId,
    driverName,
    appearances,
    wins,
    podiums,
    bestFinish,
    avgFinish: classifiedCount > 0 ? sumFinish / classifiedCount : null,
  };
}

export async function getTeamCircuitStats(teamId: string, circuitId: string): Promise<TeamCircuitStats | null> {
  const races = await getArchiveRacesByCircuitId(circuitId);
  if (races.length === 0) return null;

  let appearances = 0;
  let wins = 0;
  let podiums = 0;
  let bestFinish: number | null = null;

  for (const race of races) {
    const teamResults = race.results.filter((r) => r.teamId === teamId);
    if (teamResults.length === 0) continue;
    appearances++;
    for (const res of teamResults) {
      if (res.position) {
        if (bestFinish === null || res.position < bestFinish) bestFinish = res.position;
        if (res.position === 1) wins++;
        if (res.position <= 3) podiums++;
      }
    }
  }

  if (appearances === 0) return null;

  return {
    teamId,
    appearances,
    wins,
    podiums,
    bestFinish,
  };
}

export type RecentCircuitPhoto = { url: string; year: number };

// Below this many real photos in the rolling window, there's nothing to meaningfully rotate
// through - widen to the circuit's full history rather than let the backdrop sit dead on one
// frame forever (real, verified case: Zandvoort's own last 10 seasons have exactly one race with
// a Commons category at all, 2024 - the other 4 are genuine gaps).
const MIN_PHOTOS_FOR_ROTATION = 3;

function dedupeSortedByYear(photos: RecentCircuitPhoto[]): RecentCircuitPhoto[] {
  const seen = new Set<string>();
  return photos.filter((p) => (seen.has(p.url) ? false : seen.add(p.url))).sort((a, b) => a.year - b.year);
}

function withPhotos(races: { year: number; photoUrl?: string | null; photoUrls?: string[] | null }[]): RecentCircuitPhoto[] {
  return races.flatMap((r) => {
    const urls = r.photoUrls?.length ? r.photoUrls : r.photoUrl ? [r.photoUrl] : [];
    return urls.map((url) => ({ url, year: r.year }));
  });
}

/** Real photos of this exact circuit, preferring the last ~10 seasons — a rolling window relative
 * to `year`, not a fixed cutoff, so 2026 shows 2016-2026 and 2027 shows 2017-2027 with no code
 * change needed as seasons pass. For the homepage's rotating background. Draws on both halves of
 * "real photos per circuit": archive_races.photo_urls for seasons the archive covers,
 * races.photo_urls once FastF1 coverage starts — several per race, not just one, both filled in
 * automatically by the pipeline for every race (current or newly added to the calendar), so a
 * brand-new track just starts accumulating real photos the moment it's raced, no per-circuit
 * hardcoding on either side. Photos are real Wikimedia Commons contributor shots, not circuit
 * diagrams — see ergast_utils.py's fetch_commons_photos.
 *
 * Falls back to the circuit's *entire* real-photo history when the recent window alone has fewer
 * than MIN_PHOTOS_FOR_ROTATION — still real photos, just not all recent, and only when recency
 * alone would otherwise mean no rotation at all.
 *
 * archive_races and races legitimately overlap in years (the archive's own range was separately
 * extended through last season, see pipeline/fetch_archive.py) — same race, same id, same
 * `races/{id}-N.png` Storage paths in both tables, so de-duping by url (not by year) is what keeps
 * a recent season from showing its own photos twice in the rotation. */
export async function getRecentCircuitPhotos(
  circuitId: string | null,
  currentSeasonCircuit: string | null,
  year: number,
): Promise<RecentCircuitPhoto[]> {
  const earliestYear = year - 10;
  const [archiveRaces, currentRaces] = await Promise.all([
    circuitId ? getArchiveRacesByCircuitId(circuitId) : Promise.resolve([]),
    currentSeasonCircuit ? getRacesByCircuit(currentSeasonCircuit) : Promise.resolve([]),
  ]);

  const recent = dedupeSortedByYear([
    ...withPhotos(archiveRaces.filter((r) => r.year >= earliestYear)),
    ...withPhotos(currentRaces.filter((r) => r.year >= earliestYear)),
  ]);
  if (recent.length >= MIN_PHOTOS_FOR_ROTATION) return recent;
  return dedupeSortedByYear([...withPhotos(archiveRaces), ...withPhotos(currentRaces)]);
}

// computeChampionshipProgression moved to lib/championshipProgression.ts (a pure module, no
// supabaseAdmin in its import graph) - see that file's own comment on why. Re-exported here so
// every existing import of it from this module (season.service.ts) keeps working unchanged; a new
// client-side caller (ChampionshipTrajectory.tsx) imports the pure module directly instead.
export { computeChampionshipProgression } from "@/lib/championshipProgression";

export type Fact = { icon: string; text: string };

/** Every fact here is derived from computeSeasonStandings / getTrackHistory (real
 * race_results/pole_sitter/archive_results data), never invented copy — an empty array means
 * there's nothing to compute yet (season hasn't started, no completed races), not a placeholder
 * to render instead. */
export function buildFacts(
  year: number,
  standings: SeasonStandings,
  favoriteDriver: FavoriteDriverCard | null,
  favoriteTeam: FavoriteTeamCard | null,
  trackHistory: TrackHistory | null,
): Fact[] {
  const facts: Fact[] = [];

  const driverLeader = standings.drivers[0];
  if (driverLeader) {
    facts.push({
      icon: "🏆",
      text: `${driverLeader.driverName} leads the ${year} championship with ${driverLeader.points} points`,
    });
  }

  const teamLeader = standings.teams[0];
  if (teamLeader) {
    facts.push({ icon: "🏗️", text: `${teamLeader.team} tops the constructors' standings with ${teamLeader.points} points` });
  }

  const topPole = Object.entries(standings.poleCounts).sort((a, b) => b[1] - a[1])[0];
  if (topPole) {
    const [driverCode, count] = topPole;
    const name = standings.drivers.find((d) => d.driver === driverCode)?.driverName ?? driverCode;
    facts.push({ icon: "🎯", text: `${name} has the most poles this season (${count})` });
  }

  if (favoriteDriver?.code) {
    const rank = standings.drivers.findIndex((d) => d.driver === favoriteDriver.code);
    if (rank >= 0) {
      const s = standings.drivers[rank];
      facts.push({
        icon: "⭐",
        text: `Your favorite, ${favoriteDriver.name}, sits P${rank + 1} in the championship with ${s.points} points`,
      });
    }
  }

  if (favoriteTeam?.currentName) {
    const rank = standings.teams.findIndex((t) => t.team === favoriteTeam.currentName);
    if (rank >= 0) {
      const s = standings.teams[rank];
      facts.push({
        icon: "🔧",
        text: `${favoriteTeam.name} sits P${rank + 1} in the constructors' championship with ${s.points} points`,
      });
    }
  }

  // A coincidental crossover between "your favorite" and "who's actually won here the most" -
  // only fires when they're literally the same person/team, not a fabricated "your favorite has
  // N wins here" for every driver (that per-track breakdown isn't part of TrackHistory's shape).
  if (favoriteDriver && trackHistory?.topPerformer?.driverId === favoriteDriver.driverId) {
    facts.push({
      icon: "🎉",
      text: `Your favorite, ${favoriteDriver.name}, is also the winningest driver at the upcoming track (${trackHistory.topPerformer.wins} wins there)`,
    });
  }
  if (favoriteTeam && trackHistory?.topCurrentTeam?.name === favoriteTeam.currentName) {
    facts.push({
      icon: "🎉",
      text: `${favoriteTeam.name} has won more at the upcoming track than any other team still on the grid (${trackHistory.topCurrentTeam.wins} wins)`,
    });
  }

  return facts;
}

export type SeasonRecap = {
  roundsCompleted: number;
  totalRounds: number;
  driverLeader: DriverStanding | null;
  /** Points gap between P1 and P2 in the drivers' championship — the closest-fight number. Null
   * with fewer than two classified drivers. */
  driverGapToSecond: number | null;
  teamLeader: TeamStanding | null;
  teamGapToSecond: number | null;
  mostWins: DriverStanding | null;
  mostPodiums: DriverStanding | null;
  favoriteDriverRank: number | null; // 1-based, null if no favorite or not classified
};

/** The homepage's "how the season is unfolding" editorial recap — every number read straight off
 * `standings`/`races`, nothing computed that buildFacts/computeSeasonStandings doesn't already
 * derive from real race_results. A season with zero completed races returns all-null/zero rather
 * than a fabricated "season hasn't started" placeholder copy — the component decides how to word
 * that empty state. */
export function buildSeasonRecap(races: RaceDoc[], standings: SeasonStandings, favoriteDriver: FavoriteDriverCard | null): SeasonRecap {
  const driverLeader = standings.drivers[0] ?? null;
  const teamLeader = standings.teams[0] ?? null;
  const mostWins = [...standings.drivers].sort((a, b) => b.wins - a.wins)[0] ?? null;
  const mostPodiums = [...standings.drivers].sort((a, b) => b.podiums - a.podiums)[0] ?? null;
  const favoriteRank = favoriteDriver?.code ? standings.drivers.findIndex((d) => d.driver === favoriteDriver.code) : -1;

  return {
    roundsCompleted: races.filter((r) => r.status === "completed").length,
    totalRounds: races.length,
    driverLeader,
    driverGapToSecond: driverLeader && standings.drivers[1] ? driverLeader.points - standings.drivers[1].points : null,
    teamLeader,
    teamGapToSecond: teamLeader && standings.teams[1] ? teamLeader.points - standings.teams[1].points : null,
    mostWins: mostWins && mostWins.wins > 0 ? mostWins : null,
    mostPodiums: mostPodiums && mostPodiums.podiums > 0 ? mostPodiums : null,
    favoriteDriverRank: favoriteRank >= 0 ? favoriteRank + 1 : null,
  };
}
