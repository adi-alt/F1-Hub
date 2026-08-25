import { getArchiveDriverIdsByCode } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers, getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { computeChampionshipProgression } from "@/lib/personalization";
import { computeStandings, type ConstructorStanding, type DriverStanding } from "@/lib/standings";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";

const PROGRESSION_TOP_N = 5; // matches StandingsWidget's own top-5 slice — no point computing more

// {round: [1st, 2nd, 3rd finisher names]} for completed races only — the calendar heatmap's own
// tooltip enrichment (a "Race" tile that already happened shows who actually won, not just the
// session label + date).
export type Top3ByRound = Record<number, string[]>;

export type DriverStandingRow = DriverStanding & {
  headshotUrl: string | null;
  // archive_drivers.driver_id — the id space `profile.favoriteDrivers` is actually keyed by, not
  // this row's own 3-letter code. Null when that driver hasn't been code-matched into the archive
  // yet (see getArchiveDriverIdsByCode) — favoriting is disabled for that row until it has.
  favoriteId: string | null;
};

export type ConstructorStandingRow = ConstructorStanding & {
  logoUrl: string | null;
  favoriteId: string; // archiveSlugForCurrentTeam is a pure string mapping — always resolvable, no lookup needed
};

export async function getSeasonPageData(year: number, uid: string) {
  const [races, calendarEntries, currentDrivers, currentTeams, profile] = await Promise.all([
    getRacesByYear(year),
    getCalendarEntriesByYear(year),
    getAllCurrentDrivers(),
    getAllCurrentTeams(),
    getUserProfile(uid),
  ]);
  const standings = computeStandings(races);

  const headshotByCode = new Map(currentDrivers.map((d) => [d.code, d.headshotUrl]));
  const logoByTeam = new Map(currentTeams.map((t) => [t.name, t.logoUrl]));
  const archiveIdByCode = await getArchiveDriverIdsByCode(standings.drivers.map((d) => d.driver));

  const drivers: DriverStandingRow[] = standings.drivers.map((d) => ({
    ...d,
    headshotUrl: headshotByCode.get(d.driver) ?? null,
    favoriteId: archiveIdByCode.get(d.driver) ?? null,
  }));
  const constructors: ConstructorStandingRow[] = standings.constructors.map((c) => ({
    ...c,
    logoUrl: logoByTeam.get(c.team) ?? null,
    favoriteId: archiveSlugForCurrentTeam(c.team),
  }));

  const topDriverCodes = drivers.slice(0, PROGRESSION_TOP_N).map((d) => d.driver);
  const progression = topDriverCodes.length > 0 ? await computeChampionshipProgression(year, topDriverCodes) : [];

  const top3ByRound: Top3ByRound = {};
  for (const race of races) {
    if (race.status !== "completed" || !race.results) continue;
    top3ByRound[race.round] = race.results
      .filter((r) => r.finishPosition <= 3)
      .sort((a, b) => a.finishPosition - b.finishPosition)
      .map((r) => r.driverName);
  }

  return {
    calendarEntries,
    drivers,
    constructors,
    progression,
    top3ByRound,
    favoriteDriverIds: profile?.favoriteDrivers ?? [],
    favoriteTeamIds: profile?.favoriteTeams ?? [],
  };
}
