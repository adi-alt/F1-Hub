// Composes archive.ts + media.ts + races.ts into the two things the personalized homepage needs:
// "what does this favorite look like right now" (favorite driver/team/track cards, with a real
// current photo when the entity is still active) and "what's actually true about this season so
// far" (standings computed from real race_results, not invented). Deliberately its own module,
// not folded into lib/supabase/* — same role src/lib/highlights.ts and predictionAccuracy.ts
// already have: a derived view-model layer on top of the data layer, not a data source itself.

import { getArchiveCircuit, getArchiveDriver, getArchiveTeam } from "@/lib/supabase/archive";
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
