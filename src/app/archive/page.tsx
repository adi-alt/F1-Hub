import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveExplorer } from "./components/ArchiveExplorer";
import { ArchiveRaceList } from "./components/ArchiveRaceList";
import { CircuitCard } from "./components/CircuitCard";
import { LapChart } from "./components/LapChart";
import { PitStopsTimeline } from "./components/PitStopsTimeline";
import { QualifyingBarChart } from "./components/QualifyingBarChart";
import { ResultsBoard } from "./components/ResultsBoard";
import { ArchiveHistoryRaceList } from "./components/ArchiveHistoryRaceList";
import { RetryBanner } from "./components/RetryBanner";
import {
  ARCHIVE_EARLIEST_YEAR,
  ARCHIVE_LATEST_YEAR,
  getAllArchiveCircuitsData,
  getAllArchiveDriversData,
  getAllArchiveTeamsData,
  getArchiveCircuitData,
  getArchiveCircuitHistoryData,
  getArchiveDriverHistoryData,
  getArchiveRaceData,
  getArchiveSeasonData,
  getArchiveTeamData,
  getArchiveTeamHistoryData,
  getArchiveYearStatsData,
  getArchiveYears,
} from "./services/archive.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import type { CurrentLeader } from "@/lib/supabase/archive";
import { getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { computeStandings } from "@/lib/standings";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";
import { getUserProfile } from "@/lib/supabase/users";
import { safeRead, safeReadTracked } from "@/lib/safeRead";
import { archiveSeasonHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

type Facet = "year" | "track" | "driver" | "team";

// A Firestore outage (quota, transient error, anything) degrades this page to empty
// tabs/favorites instead of crashing it outright — the same "temporarily nothing here" empty
// states these components already show when a pipeline pass genuinely hasn't reached this data
// yet double as the degraded view; nothing new to build for that.
/** Reconciles the current season's own roster against the archive - the same direction of the
 * current-season <-> archive matching problem src/app/profile/page.tsx's mergeCurrentSeason
 * already solves (there: fold this year's names into the archive-sourced favorite lists; here:
 * flag which existing archive circuits/teams are also this year's), reusing the exact same
 * resolver functions rather than writing a second matching implementation. Also derives
 * `currentLeader` from the same current-season fetch, so as not to duplicate it - this year's
 * points leader, computed with the same pure computeStandings the season page itself uses, for
 * the year-card hover tooltip on the in-progress season (which the archive has no rows for at
 * all). Best-effort: if the current season's own data can't be read right now, everything just
 * degrades to "historical, no leader" rather than crashing the whole Archive page over one extra
 * cross-reference. */
async function getActiveIds(
  circuits: Awaited<ReturnType<typeof getAllArchiveCircuitsData>>,
): Promise<{ circuitIds: string[]; teamIds: string[]; currentLeader: CurrentLeader }> {
  const empty = { circuitIds: [], teamIds: [], currentLeader: { driver: null, team: null } };
  try {
    const year = new Date().getFullYear();
    const [races, currentTeams] = await Promise.all([getRacesByYear(year), getAllCurrentTeams()]);
    const circuitLocalities = new Map(circuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
    const circuitIdsByName = new Map(circuits.map((c) => [(c.name ?? c.circuitId).trim().toLowerCase(), c.circuitId]));

    const circuitIds = new Set<string>();
    for (const race of races) {
      const resolved = resolveCurrentCircuitToArchiveId(race.circuit, circuitLocalities, circuitIdsByName);
      if (resolved) circuitIds.add(resolved);
    }
    const teamIds = currentTeams.map((t) => archiveSlugForCurrentTeam(t.name));

    const standings = computeStandings(races);
    const topDriver = standings.drivers[0];
    const topTeam = standings.constructors[0];
    const currentLeader: CurrentLeader = {
      driver: topDriver ? { name: topDriver.driverName, points: topDriver.points } : null,
      team: topTeam ? { name: topTeam.team, points: topTeam.points } : null,
    };

    return { circuitIds: [...circuitIds], teamIds, currentLeader };
  } catch (error) {
    console.error("ArchiveIndex: current-season reconciliation failed, treating everything as historical:", error);
    return empty;
  }
}

async function ArchiveIndex({ section, uid }: { section: Facet; uid: string }) {
  // Circuits and year-stats are unconditionally eager: circuits because getActiveIds' active/
  // historical reconciliation needs the full list regardless of which tab is open (and its own
  // fetch is far cheaper than drivers/teams anyway), year-stats because "By year" - the default -
  // needs it immediately. Drivers (805 rows) and teams (171 rows) are each only eager-fetched here
  // when they're the *initial* facet - a direct load of ?section=driver still paints with real data
  // on first byte - otherwise left undefined and picked up client-side the first time that tab is
  // actually visited (see ArchiveExplorer's useArchiveDrivers/useArchiveTeams). Previously all four
  // facets' data was fetched on every load no matter which one was being looked at.
  const [circuitsRead, driversRead, teamsRead, profile, yearStats] = await Promise.all([
    safeReadTracked(() => getAllArchiveCircuitsData(), []),
    section === "driver" ? safeReadTracked(() => getAllArchiveDriversData(), []) : Promise.resolve(null),
    section === "team" ? safeReadTracked(() => getAllArchiveTeamsData(), []) : Promise.resolve(null),
    safeRead(() => getUserProfile(uid), null),
    safeRead(() => getArchiveYearStatsData(), {} as Awaited<ReturnType<typeof getArchiveYearStatsData>>),
  ]);
  const { data: circuits } = circuitsRead;
  // Real failure, not "genuinely nothing indexed yet" - safeRead alone can't tell those apart
  // (both just come back as []), and only the former should read as an error to retry. A facet
  // that wasn't eager-fetched here (driversRead/teamsRead null) hasn't failed - it hasn't been
  // attempted yet, that's the client query's job.
  const hasLoadError = circuitsRead.failed || driversRead?.failed || teamsRead?.failed;
  const { circuitIds: activeCircuitIds, teamIds: activeTeamIds, currentLeader } = await getActiveIds(circuits);

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
      <h1 className="flex shrink-0 items-baseline gap-3">
        <span className="text-5xl font-bold tracking-tight text-white sm:text-6xl">Archive</span>
        <span className="text-sm font-semibold uppercase tracking-[0.25em] text-neutral-500">
          {ARCHIVE_EARLIEST_YEAR}–{ARCHIVE_LATEST_YEAR}
        </span>
      </h1>
      <p className="mt-1 shrink-0 text-sm text-neutral-500">Results only, sourced from the Ergast/Jolpi historical database.</p>
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        {hasLoadError && <RetryBanner />}
        <ArchiveExplorer
          uid={uid}
          initialSection={section}
          years={getArchiveYears()}
          currentYear={new Date().getFullYear()}
          circuits={circuits}
          initialDrivers={driversRead?.data}
          initialTeams={teamsRead?.data}
          activeCircuitIds={activeCircuitIds}
          activeTeamIds={activeTeamIds}
          yearStats={yearStats}
          currentLeader={currentLeader}
          favoriteTracks={profile?.favoriteTracks ?? []}
          favoriteDrivers={profile?.favoriteDrivers ?? []}
          favoriteTeams={profile?.favoriteTeams ?? []}
        />
      </div>
    </div>
  );
}

async function ArchiveSeason({ year }: { year: number }) {
  const races = await getArchiveSeasonData(year);
  if (races.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Link href="/archive" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Archive
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
        <p className="mt-4 text-sm text-neutral-500">No results backfilled for this season yet.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/archive" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
      <p className="mt-1 text-sm text-neutral-500">{races.length} races</p>
      <ArchiveRaceList year={year} races={races} />
    </div>
  );
}

async function ArchiveRace({ year, round }: { year: number; round: number }) {
  const race = await getArchiveRaceData(year, round);
  if (!race) notFound();

  const circuit = race.circuitId ? await getArchiveCircuitData(race.circuitId) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href={archiveSeasonHref(year)} className="text-sm text-neutral-500 hover:text-neutral-300">
        ← {year}
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{race.raceName}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {race.circuitName}
        {race.locality ? `, ${race.locality}` : ""}
        {race.country ? `, ${race.country}` : ""}
        {race.raceDate ? ` · ${race.raceDate}` : ""}
        {race.wikipediaUrl && (
          <>
            {" · "}
            <a href={race.wikipediaUrl} target="_blank" rel="noreferrer" className="text-[var(--f1-red)] hover:underline">
              Full race report on Wikipedia →
            </a>
          </>
        )}
      </p>

      {circuit && (
        <div className="mt-6">
          <CircuitCard circuit={circuit} weather={race.weather} />
        </div>
      )}

      <div className="mt-8">
        <ResultsBoard results={race.results} qualifying={race.qualifying} pitStops={race.pitStops} />
      </div>

      {!!race.qualifying?.length && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-white">Qualifying</h2>
          <QualifyingBarChart qualifying={race.qualifying} />
        </div>
      )}

      {!!race.pitStops?.length && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-white">Pit stops</h2>
          <PitStopsTimeline pitStops={race.pitStops} results={race.results} />
        </div>
      )}

      {race.lapsBackfilled && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-white">Race progress</h2>
          <LapChart year={year} round={round} results={race.results} />
        </div>
      )}
    </div>
  );
}

async function ArchiveCircuitHistory({ circuitId }: { circuitId: string }) {
  const [circuit, races] = await Promise.all([
    getArchiveCircuitData(circuitId),
    getArchiveCircuitHistoryData(circuitId),
  ]);
  if (!circuit) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/archive?section=track" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{circuit.name ?? circuit.circuitId}</h1>
      <div className="mt-4">
        <CircuitCard circuit={circuit} />
      </div>
      <p className="mt-6 text-sm text-neutral-500">
        {races.length} race{races.length === 1 ? "" : "s"} on record here
      </p>
      <ArchiveHistoryRaceList
        className="mt-3 space-y-2"
        races={races.map((r) => ({
          id: r.id,
          year: r.year,
          round: r.round,
          raceName: r.raceName,
          secondaryLabel: "Winner",
          secondaryValue: r.results.find((res) => res.position === 1)?.driverName ?? null,
        }))}
      />
    </div>
  );
}

async function ArchiveDriverHistory({ driverId }: { driverId: string }) {
  const races = await getArchiveDriverHistoryData(driverId);
  if (races.length === 0) notFound();

  const name = races[0].results.find((r) => r.driverId === driverId)?.driverName ?? driverId;
  const years = races.map((r) => r.year);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/archive?section=driver" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {Math.min(...years)}–{Math.max(...years)} · {races.length} race{races.length === 1 ? "" : "s"}
      </p>
      <ArchiveHistoryRaceList
        races={races.map((r) => ({
          id: r.id,
          year: r.year,
          round: r.round,
          raceName: r.raceName,
          secondaryLabel: "Finished",
          secondaryValue: r.results.find((res) => res.driverId === driverId)?.positionText ?? null,
        }))}
      />
    </div>
  );
}

async function ArchiveTeamHistory({ teamId }: { teamId: string }) {
  const [team, races] = await Promise.all([getArchiveTeamData(teamId), getArchiveTeamHistoryData(teamId)]);
  if (!team) notFound();

  const years = races.map((r) => r.year);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/archive?section=team" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{team.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {Math.min(...years)}–{Math.max(...years)} · {races.length} race{races.length === 1 ? "" : "s"}
      </p>
      <ArchiveHistoryRaceList
        races={races.map((r) => ({
          id: r.id,
          year: r.year,
          round: r.round,
          raceName: r.raceName,
          secondaryLabel: "Winner",
          secondaryValue: r.results.find((res) => res.position === 1)?.driverName ?? null,
        }))}
      />
    </div>
  );
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    round?: string;
    section?: string;
    circuit?: string;
    driver?: string;
    team?: string;
  }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <SignInGate label="the historical archive" />
      </div>
    );
  }

  const { year: yearParam, round: roundParam, section, circuit, driver, team } = await searchParams;
  const year = yearParam ? Number(yearParam) : null;
  const round = roundParam ? Number(roundParam) : null;

  if (year && round) return <ArchiveRace year={year} round={round} />;
  if (year) return <ArchiveSeason year={year} />;
  if (circuit) return <ArchiveCircuitHistory circuitId={circuit} />;
  if (driver) return <ArchiveDriverHistory driverId={driver} />;
  if (team) return <ArchiveTeamHistory teamId={team} />;
  const facet: Facet = section === "track" || section === "driver" || section === "team" ? section : "year";
  return <ArchiveIndex section={facet} uid={session.uid} />;
}
