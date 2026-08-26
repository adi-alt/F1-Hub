import { getArchiveDriverIdsByCode } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers, getAllCurrentTeams } from "@/lib/supabase/media";
import { getLatestNews } from "@/lib/supabase/news";
import { getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { trackShortForm } from "@/lib/format";
import { computeChampionshipProgression, type Fact } from "@/lib/personalization";
import { computeStandings, type ConstructorStanding, type DriverStanding } from "@/lib/standings";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";
import type { RaceDoc } from "@/lib/types/race";

const FEATURED_DRIVER_COUNT = 5;

// Every completed race's finishing order, keyed for O(1) per-driver/per-team lookup — the
// head-to-head widget's "who performed on which track" breakdown joins this against whichever two
// drivers/teams are selected, entirely client-side, no new fetch per comparison.
export type TrackPerformance = {
  round: number;
  trackShort: string;
  driverPositions: Record<string, number>;
  teamBestPositions: Record<string, number>;
};

function buildTrackPerformance(races: RaceDoc[]): TrackPerformance[] {
  const completed = races.filter((r) => r.status === "completed" && r.results).sort((a, b) => a.round - b.round);
  return completed.map((race) => {
    const driverPositions: Record<string, number> = {};
    const teamBestPositions: Record<string, number> = {};
    for (const r of race.results ?? []) {
      driverPositions[r.driver] = r.finishPosition;
      if (!(r.team in teamBestPositions) || r.finishPosition < teamBestPositions[r.team]) {
        teamBestPositions[r.team] = r.finishPosition;
      }
    }
    return { round: race.round, trackShort: trackShortForm(race.circuit), driverPositions, teamBestPositions };
  });
}

// Fisher-Yates — plain array shuffle, no dependency needed for one line of logic.
function shuffled<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

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
// single favorite entity, since there's no one "subject" here to build facts about. Returns every
// candidate that actually applies (not a fixed top-N) — shuffled, so the same underlying data
// reads as a different set/order each time the widget picks its visible subset (see
// SeasonPulseWidget's own shuffle control) instead of the identical list on every visit.
function buildSeasonFacts(
  drivers: DriverStandingRow[],
  constructors: ConstructorStandingRow[],
  calendarEntries: CalendarEntry[],
  races: RaceDoc[],
): Fact[] {
  const facts: Fact[] = [];
  const completed = races.filter((r) => r.status === "completed" && r.results);

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

  const mostPodiumsDriver = [...drivers].sort((a, b) => b.podiums - a.podiums)[0];
  if (mostPodiumsDriver?.podiums > 0) {
    facts.push({ icon: "🍾", text: `${mostPodiumsDriver.driverName} has been on the podium the most this season (${mostPodiumsDriver.podiums} times)` });
  }

  const [topTeam, secondTeam] = constructors;
  if (topTeam) {
    facts.push({ icon: "🏗️", text: `${topTeam.team} leads the constructors' championship with ${topTeam.points} points` });
  }
  if (topTeam && secondTeam && topTeam.points > secondTeam.points) {
    facts.push({ icon: "⚙️", text: `${secondTeam.team} trails ${topTeam.team} by ${topTeam.points - secondTeam.points} points in the constructors' fight` });
  }

  if (leader && completed.length > 0) {
    const perRace = leader.points / completed.length;
    facts.push({ icon: "📈", text: `${leader.driverName} is averaging ${perRace.toFixed(1)} points per race this season` });
  }

  const scored = drivers.filter((d) => d.points > 0);
  if (leader && scored.length > 1) {
    const last = scored[scored.length - 1];
    facts.push({ icon: "📊", text: `${leader.points - last.points} points separate ${leader.driverName} from ${last.driverName} in the standings` });
  }

  const winners = new Set<string>();
  for (const race of completed) {
    const winner = race.results?.find((r) => r.finishPosition === 1);
    if (winner) winners.add(winner.driverName);
  }
  if (winners.size > 1) {
    facts.push({ icon: "🎲", text: `${winners.size} different drivers have won a race so far this season` });
  }

  const now = Date.now();
  const upcoming = calendarEntries
    .filter((e) => e.raceDate && new Date(e.raceDate).getTime() > now)
    .sort((a, b) => new Date(a.raceDate!).getTime() - new Date(b.raceDate!).getTime())[0];
  if (upcoming?.raceDate) {
    const days = Math.max(0, Math.ceil((new Date(upcoming.raceDate).getTime() - now) / 86_400_000));
    facts.push({ icon: "📅", text: `${upcoming.name ?? `Round ${upcoming.round}`} is ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}` });
  }

  return shuffled(facts);
}

export async function getSeasonPageData(year: number, uid: string) {
  const [races, calendarEntries, currentDrivers, currentTeams, profile, news] = await Promise.all([
    getRacesByYear(year),
    getCalendarEntriesByYear(year),
    getAllCurrentDrivers(),
    getAllCurrentTeams(),
    getUserProfile(uid),
    getLatestNews(10),
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

  // A random 5 of whoever's actually scored (not always literally rank 1-5) — same "not always
  // the same view every visit" spirit as the homepage's own randomized table/bar/line pick,
  // reshuffled on every request rather than picked once and cached.
  const scored = drivers.filter((d) => d.points > 0);
  const progressionDrivers = shuffled(scored).slice(0, FEATURED_DRIVER_COUNT);
  const progression = progressionDrivers.length > 0 ? await computeChampionshipProgression(year, progressionDrivers.map((d) => d.driver)) : [];

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
    progressionDrivers,
    top3ByRound,
    trackPerformance: buildTrackPerformance(races),
    facts: buildSeasonFacts(drivers, constructors, calendarEntries, races),
    news,
    favoriteDriverIds: profile?.favoriteDrivers ?? [],
    favoriteTeamIds: profile?.favoriteTeams ?? [],
  };
}
