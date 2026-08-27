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

// FastF1 (see pipeline/sync_calendar.py's own all_sessions()) writes whatever a weekend's
// sessions are actually called ("Practice 1", "Sprint Qualifying", "Sprint Shootout", "Race", …)
// rather than a fixed 5-slot enum, since the sprint format itself has changed session names across
// seasons. Reading a short code back out the same way — by substring, not an exhaustive lookup —
// means a future rename doesn't quietly fall through to an unlabeled cell.
function sessionCode(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("practice")) return `P${l.match(/\d/)?.[0] ?? ""}`;
  if (l.includes("sprint") && (l.includes("qualif") || l.includes("shootout"))) return "SQ";
  if (l.includes("sprint")) return "SR";
  if (l.includes("qualif")) return "Q";
  if (l.includes("race")) return "R";
  return label.slice(0, 2).toUpperCase();
}

export type RaceSessionSummary = { label: string; code: string; date: string; state: "completed" | "current" | "upcoming" };

// One entry per round of the *whole* season (including rounds with no FastF1 data yet) — the
// single structure behind the season calendar, the per-track comparison breakdown, and every
// derived driver/team stat (avg finish, poles, DNFs) that needs "every completed race" instead of
// just the current totals. `state` is the race-level summary (done/next/upcoming); `sessions` is
// the session-by-session breakdown the calendar's own grid renders.
export type RaceSummary = {
  round: number;
  name: string;
  trackShort: string;
  raceDate: string | null;
  state: "completed" | "next" | "upcoming";
  sessions: RaceSessionSummary[];
  poleSitter: string | null;
  results: RaceResultSummary[]; // [] until the race is actually completed
};

function buildRaceSummaries(races: RaceDoc[], calendarEntries: CalendarEntry[]): RaceSummary[] {
  const raceByRound = new Map(races.map((r) => [r.round, r]));
  const sorted = [...calendarEntries].sort((a, b) => a.round - b.round);

  const now = Date.now();
  const nextRound = sorted.find((e) => e.raceDate && new Date(e.raceDate).getTime() > now)?.round;

  // The single "what's happening next" pointer, but at session granularity instead of race
  // granularity — every session across the whole season, chronologically, so each weekend's
  // sessions can be marked completed/current/upcoming individually instead of the whole weekend
  // switching state at once.
  const allSessions = sorted
    .flatMap((e) => e.sessions.map((s) => ({ ...s, round: e.round })))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const currentSession = allSessions.find((s) => new Date(s.date).getTime() > now);

  return sorted.map((entry) => {
    const race = raceByRound.get(entry.round);
    const completed = race?.status === "completed" && !!race.results?.length;
    return {
      round: entry.round,
      name: entry.name ?? `Round ${entry.round}`,
      trackShort: trackShortForm(race?.circuit ?? entry.circuit ?? entry.name ?? `R${entry.round}`),
      raceDate: entry.raceDate,
      state: completed ? "completed" : entry.round === nextRound ? "next" : "upcoming",
      sessions: entry.sessions.map((s) => ({
        label: s.label,
        code: sessionCode(s.label),
        date: s.date,
        state:
          new Date(s.date).getTime() <= now
            ? "completed"
            : currentSession && currentSession.round === entry.round && currentSession.label === s.label
              ? "current"
              : "upcoming",
      })),
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

// `name` is the driver/team/pairing the record belongs to (shown at normal weight); `value` is
// the number itself, meant to read as the strongest text in the row — kept apart instead of one
// pre-joined string so the records view can give the two very different visual weight.
export type SeasonRecord = { label: string; name: string; value: string };

// A compact reference grid, not the old rotating "fun facts" widget — deterministic, since this
// is meant to be looked up, not rediscovered on every visit.
function buildRecords(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[], raceSummaries: RaceSummary[]): SeasonRecord[] {
  const records: SeasonRecord[] = [];
  const completed = raceSummaries.filter((r) => r.state === "completed");

  const mostWins = [...drivers].sort((a, b) => b.wins - a.wins)[0];
  if (mostWins?.wins > 0) records.push({ label: "Most wins", name: mostWins.driverName, value: String(mostWins.wins) });

  const mostPodiums = [...drivers].sort((a, b) => b.podiums - a.podiums)[0];
  if (mostPodiums?.podiums > 0) records.push({ label: "Most podiums", name: mostPodiums.driverName, value: String(mostPodiums.podiums) });

  const poleCounts = new Map<string, number>();
  for (const r of completed) if (r.poleSitter) poleCounts.set(r.poleSitter, (poleCounts.get(r.poleSitter) ?? 0) + 1);
  const topPole = [...poleCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPole) {
    const d = drivers.find((x) => x.driver === topPole[0]);
    records.push({ label: "Most poles", name: d?.driverName ?? topPole[0], value: String(topPole[1]) });
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
    records.push({ label: "Best avg finish", name: d?.driverName ?? bestAvg.code, value: `P${bestAvg.avg.toFixed(1)}` });
  }

  const [leader, second] = drivers;
  if (leader && second) records.push({ label: "Points margin", name: `${leader.driverName} over ${second.driverName}`, value: String(leader.points - second.points) });

  const winners = new Set<string>();
  for (const r of completed) {
    const winner = r.results.find((x) => x.finishPosition === 1);
    if (winner) winners.add(winner.driverName);
  }
  if (winners.size > 0) records.push({ label: "Race winners", name: "Different drivers to win", value: String(winners.size) });

  const topTeam = constructors[0];
  if (topTeam) records.push({ label: "Constructors lead", name: topTeam.team, value: String(topTeam.points) });

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
