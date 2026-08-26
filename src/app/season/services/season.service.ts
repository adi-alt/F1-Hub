import { getArchiveDriverIdsByCode } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers, getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { computeChampionshipProgression, type Fact } from "@/lib/personalization";
import { computeStandings, type ConstructorStanding, type DriverStanding } from "@/lib/standings";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";

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

// Real, derived facts for the season page's right-rail widget — same shape/spirit as the
// homepage's own buildFacts, just computed from this page's own standings/calendar instead of a
// single favorite entity, since there's no one "subject" here to build facts about.
function buildSeasonFacts(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[], calendarEntries: CalendarEntry[]): Fact[] {
  const facts: Fact[] = [];

  const [leader, second] = drivers;
  if (leader && second && leader.points > second.points) {
    facts.push({ icon: "🏆", text: `${leader.driverName} leads the championship by ${leader.points - second.points} points over ${second.driverName}` });
  }

  let closest: { a: DriverStandingRow; b: DriverStandingRow; gap: number } | null = null;
  for (let i = 0; i < drivers.length - 1; i++) {
    const gap = drivers[i].points - drivers[i + 1].points;
    if (gap > 0 && (!closest || gap < closest.gap)) closest = { a: drivers[i], b: drivers[i + 1], gap };
  }
  if (closest) {
    facts.push({ icon: "🔥", text: `Tightest fight in the order: ${closest.a.driverName} vs ${closest.b.driverName}, just ${closest.gap} point${closest.gap === 1 ? "" : "s"} apart` });
  }

  const mostWinsDriver = [...drivers].sort((a, b) => b.wins - a.wins)[0];
  if (mostWinsDriver?.wins > 0) {
    facts.push({ icon: "🥇", text: `${mostWinsDriver.driverName} has the most race wins so far this season (${mostWinsDriver.wins})` });
  }

  const topTeam = constructors[0];
  if (topTeam) {
    facts.push({ icon: "🏗️", text: `${topTeam.team} leads the constructors' championship with ${topTeam.points} points` });
  }

  const now = Date.now();
  const upcoming = calendarEntries
    .filter((e) => e.raceDate && new Date(e.raceDate).getTime() > now)
    .sort((a, b) => new Date(a.raceDate!).getTime() - new Date(b.raceDate!).getTime())[0];
  if (upcoming?.raceDate) {
    const days = Math.max(0, Math.ceil((new Date(upcoming.raceDate).getTime() - now) / 86_400_000));
    facts.push({ icon: "📅", text: `${upcoming.name ?? `Round ${upcoming.round}`} is ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}` });
  }

  return facts;
}

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

  // Every driver who's actually scored, not just the top few — the season page is the full,
  // detailed view (unlike the homepage widget's deliberately small top-5 preview).
  const scoredDriverCodes = drivers.filter((d) => d.points > 0).map((d) => d.driver);
  const progression = scoredDriverCodes.length > 0 ? await computeChampionshipProgression(year, scoredDriverCodes) : [];

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
    facts: buildSeasonFacts(drivers, constructors, calendarEntries),
    favoriteDriverIds: profile?.favoriteDrivers ?? [],
    favoriteTeamIds: profile?.favoriteTeams ?? [],
  };
}
