import { getArchiveDriverIdsByCode } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers, getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { trackShortForm } from "@/lib/format";
import { computeChampionshipProgression } from "@/lib/personalization";
import { computeStandings, type ConstructorStanding, type DriverStanding } from "@/lib/standings";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { RaceDoc } from "@/lib/types/race";

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

export type RaceResultSummary = {
  driver: string;
  driverName: string;
  team: string;
  finishPosition: number;
  points: number;
  grid: number | null;
  status: "finished" | "lapped" | "dnf";
};

// One entry per round of the *whole* season (including rounds with no FastF1 data yet) — the
// single structure behind the race timeline, the per-track comparison breakdown, and every
// derived driver/team stat (avg finish, poles, DNFs) that needs "every completed race" instead of
// just the current totals. `state` is what the timeline actually renders (done/next/upcoming).
export type RaceSummary = {
  round: number;
  name: string;
  trackShort: string;
  raceDate: string | null;
  state: "completed" | "next" | "upcoming";
  poleSitter: string | null;
  results: RaceResultSummary[]; // [] until the race is actually completed
};

function buildRaceSummaries(races: RaceDoc[], calendarEntries: CalendarEntry[]): RaceSummary[] {
  const raceByRound = new Map(races.map((r) => [r.round, r]));
  const sorted = [...calendarEntries].sort((a, b) => a.round - b.round);

  const now = Date.now();
  const nextRound = sorted.find((e) => e.raceDate && new Date(e.raceDate).getTime() > now)?.round;

  return sorted.map((entry) => {
    const race = raceByRound.get(entry.round);
    const completed = race?.status === "completed" && !!race.results?.length;
    return {
      round: entry.round,
      name: entry.name ?? `Round ${entry.round}`,
      trackShort: trackShortForm(race?.circuit ?? entry.circuit ?? entry.name ?? `R${entry.round}`),
      raceDate: entry.raceDate,
      state: completed ? "completed" : entry.round === nextRound ? "next" : "upcoming",
      poleSitter: race?.poleSitter ?? null,
      results: completed
        ? (race?.results ?? []).map((r) => ({
            driver: r.driver,
            driverName: r.driverName,
            team: r.team,
            finishPosition: r.finishPosition,
            points: r.points,
            grid: r.grid,
            status: r.status,
          }))
        : [],
    };
  });
}

export type Battle = {
  type: "drivers" | "constructors";
  aId: string;
  aLabel: string;
  aValue: number;
  bId: string;
  bLabel: string;
  bValue: number;
  gap: number;
};

// Adjacent-in-the-standings gaps, drivers and constructors both, tightest first — clicking one
// (see AnalysisWorkspace.tsx) opens Compare with that exact pair pre-selected.
function buildBattles(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[]): Battle[] {
  const battles: Battle[] = [];
  for (let i = 0; i < drivers.length - 1; i++) {
    battles.push({
      type: "drivers",
      aId: drivers[i].driver,
      aLabel: drivers[i].driverName,
      aValue: drivers[i].points,
      bId: drivers[i + 1].driver,
      bLabel: drivers[i + 1].driverName,
      bValue: drivers[i + 1].points,
      gap: drivers[i].points - drivers[i + 1].points,
    });
  }
  for (let i = 0; i < constructors.length - 1; i++) {
    battles.push({
      type: "constructors",
      aId: constructors[i].team,
      aLabel: constructors[i].team,
      aValue: constructors[i].points,
      bId: constructors[i + 1].team,
      bLabel: constructors[i + 1].team,
      bValue: constructors[i + 1].points,
      gap: constructors[i].points - constructors[i + 1].points,
    });
  }
  return battles.sort((a, b) => a.gap - b.gap).slice(0, 6);
}

export type SeasonRecord = { icon: string; label: string; value: string };

// A compact reference grid, not the old rotating "fun facts" widget — deterministic, since this
// is meant to be looked up, not rediscovered on every visit.
function buildRecords(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[], raceSummaries: RaceSummary[]): SeasonRecord[] {
  const records: SeasonRecord[] = [];
  const completed = raceSummaries.filter((r) => r.state === "completed");

  const mostWins = [...drivers].sort((a, b) => b.wins - a.wins)[0];
  if (mostWins?.wins > 0) records.push({ icon: "🥇", label: "Most wins", value: `${mostWins.driverName} — ${mostWins.wins}` });

  const mostPodiums = [...drivers].sort((a, b) => b.podiums - a.podiums)[0];
  if (mostPodiums?.podiums > 0) records.push({ icon: "🍾", label: "Most podiums", value: `${mostPodiums.driverName} — ${mostPodiums.podiums}` });

  const poleCounts = new Map<string, number>();
  for (const r of completed) if (r.poleSitter) poleCounts.set(r.poleSitter, (poleCounts.get(r.poleSitter) ?? 0) + 1);
  const topPole = [...poleCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPole) {
    const d = drivers.find((x) => x.driver === topPole[0]);
    records.push({ icon: "⏱️", label: "Most poles", value: `${d?.driverName ?? topPole[0]} — ${topPole[1]}` });
  }

  const avgFinishByDriver = new Map<string, number[]>();
  for (const r of completed) {
    for (const res of r.results) {
      const positions = avgFinishByDriver.get(res.driver);
      if (positions) positions.push(res.finishPosition);
      else avgFinishByDriver.set(res.driver, [res.finishPosition]);
    }
  }
  let bestAvg: { code: string; avg: number } | null = null;
  for (const [code, positions] of avgFinishByDriver) {
    if (positions.length < 3) continue; // needs a real sample, not one lucky race
    const avg = positions.reduce((s, p) => s + p, 0) / positions.length;
    if (!bestAvg || avg < bestAvg.avg) bestAvg = { code, avg };
  }
  if (bestAvg) {
    const d = drivers.find((x) => x.driver === bestAvg!.code);
    records.push({ icon: "📈", label: "Best average finish", value: `${d?.driverName ?? bestAvg.code} — P${bestAvg.avg.toFixed(1)}` });
  }

  const [leader, second] = drivers;
  if (leader && second) records.push({ icon: "🏆", label: "Points margin", value: `${leader.points - second.points} pts — ${leader.driverName} over ${second.driverName}` });

  const winners = new Set<string>();
  for (const r of completed) {
    const winner = r.results.find((x) => x.finishPosition === 1);
    if (winner) winners.add(winner.driverName);
  }
  if (winners.size > 0) records.push({ icon: "🎲", label: "Race winners this season", value: `${winners.size} different driver${winners.size === 1 ? "" : "s"}` });

  const topTeam = constructors[0];
  if (topTeam) records.push({ icon: "🏗️", label: "Constructors leader", value: `${topTeam.team} — ${topTeam.points} pts` });

  return records;
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

  // Every driver who's actually scored, not a fixed top-N — the Progression view's Top 5 (real
  // standings top 5)/Following/Custom selectors all filter this same, already-fetched dataset
  // client-side, so switching between them is instant, no new request.
  const scoredCodes = drivers.filter((d) => d.points > 0).map((d) => d.driver);
  const progression = scoredCodes.length > 0 ? await computeChampionshipProgression(year, scoredCodes) : [];

  const raceSummaries = buildRaceSummaries(races, calendarEntries);
  const completedCount = raceSummaries.filter((r) => r.state === "completed").length;

  return {
    year,
    drivers,
    constructors,
    progression,
    raceSummaries,
    racesCompleted: completedCount,
    racesRemaining: raceSummaries.length - completedCount,
    battles: buildBattles(drivers, constructors),
    records: buildRecords(drivers, constructors, raceSummaries),
    favoriteDriverIds: profile?.favoriteDrivers ?? [],
    favoriteTeamIds: profile?.favoriteTeams ?? [],
  };
}
