// Composes archive.ts + media.ts + races.ts into the two things the personalized homepage needs:
// "what does this favorite look like right now" (favorite driver/team/track cards, with a real
// current photo when the entity is still active) and "what's actually true about this season so
// far" (standings computed from real race_results, not invented). Deliberately its own module,
// not folded into lib/supabase/* — same role src/lib/highlights.ts and predictionAccuracy.ts
// already have: a derived view-model layer on top of the data layer, not a data source itself.

import { getArchiveCircuit, getArchiveDriver, getArchiveRacesByCircuitId, getArchiveTeam } from "@/lib/supabase/archive";
import { getAllCurrentTeams, getCurrentDriver } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { archiveCircuitHref, archiveDriverHref, archiveTeamHref } from "@/lib/routes";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";

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
export type TrackYoungestWinner = { driverId: string; driverName: string; year: number; ageYears: number; photoUrl: string | null; href: string };
export type TrackTopCurrentTeam = { name: string; wins: number; logoUrl: string | null; color: string | null };

export type TrackHistory = {
  circuitId: string;
  circuitImageUrl: string | null;
  totalRaces: number;
  firstYear: number;
  lastYear: number;
  topPerformer: TrackTopPerformer | null;
  youngestWinner: TrackYoungestWinner | null;
  topCurrentTeam: TrackTopCurrentTeam | null;
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
export async function getTrackHistory(circuitId: string): Promise<TrackHistory | null> {
  const races = await getArchiveRacesByCircuitId(circuitId);
  if (races.length === 0) return null;

  const winsByDriver = new Map<string, { driverName: string; wins: number }>();
  const winsByTeamId = new Map<string, number>();
  let youngestWinner: TrackYoungestWinner | null = null;
  let minAgeYears = Infinity;

  for (const race of races) {
    const winner = race.results.find((r) => r.position === 1);
    if (!winner) continue;

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

  let topPerformer: TrackTopPerformer | null = null;
  const topEntry = [...winsByDriver.entries()].sort((a, b) => b[1].wins - a[1].wins)[0];
  if (topEntry) {
    const [driverId, info] = topEntry;
    const driverInfo = await getArchiveDriver(driverId);
    topPerformer = { driverId, driverName: info.driverName, wins: info.wins, photoUrl: driverInfo?.photoUrl ?? null, href: archiveDriverHref(driverId) };
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

  return {
    circuitId,
    circuitImageUrl: circuit?.imageUrl ?? null,
    totalRaces: races.length,
    firstYear: races[0].year,
    lastYear: races.at(-1)!.year,
    topPerformer,
    youngestWinner,
    topCurrentTeam,
  };
}

/** Cumulative points per round for a fixed set of drivers — the "curve" half of the homepage's
 * randomized table-vs-chart fact presentation (computeSeasonStandings is the table/bar half).
 * One flat object per completed round (`{round, HAM: 45, VER: 60, ...}`) since that's the shape
 * recharts' own multi-<Line> convention wants — each driver code becomes its own dataKey. */
export async function computeChampionshipProgression(
  year: number,
  driverCodes: string[],
): Promise<Record<string, number>[]> {
  const races = await getRacesByYear(year);
  const completed = races.filter((r) => r.status === "completed").sort((a, b) => a.round - b.round);

  const running: Record<string, number> = {};
  for (const code of driverCodes) running[code] = 0;

  return completed.map((race) => {
    for (const r of race.results ?? []) {
      if (r.driver in running) running[r.driver] += r.points;
    }
    return { round: race.round, ...running };
  });
}

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
      text: `Your favorite, ${favoriteDriver.name}, is also the winningest driver at the upcoming track — ${trackHistory.topPerformer.wins} wins there`,
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
