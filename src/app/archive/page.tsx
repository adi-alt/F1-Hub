import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveExplorer } from "./components/ArchiveExplorer";
import { ArchiveRaceList } from "./components/ArchiveRaceList";
import { CircuitCard } from "./components/CircuitCard";
import { LapChart } from "./components/LapChart";
import { PitStopsTimeline } from "./components/PitStopsTimeline";
import { QualifyingBarChart } from "./components/QualifyingBarChart";
import { ResultsBoard } from "./components/ResultsBoard";
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
  getArchiveYears,
} from "./services/archive.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { getUserProfile } from "@/lib/firestore/users";
import { archiveRaceHref, archiveSeasonHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

type Facet = "year" | "track" | "driver" | "team";

async function ArchiveIndex({ by, uid }: { by: Facet; uid: string }) {
  const [circuits, drivers, teams, profile] = await Promise.all([
    getAllArchiveCircuitsData(),
    getAllArchiveDriversData(),
    getAllArchiveTeamsData(),
    getUserProfile(uid),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Archive</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every season from {ARCHIVE_EARLIEST_YEAR} to {ARCHIVE_LATEST_YEAR} — results only, sourced
        from the Ergast/Jolpi historical database.
      </p>
      <ArchiveExplorer
        initialBy={by}
        years={getArchiveYears()}
        circuits={circuits}
        drivers={drivers}
        teams={teams}
        favoriteTracks={profile?.favoriteTracks ?? []}
        favoriteDrivers={profile?.favoriteDrivers ?? []}
        favoriteTeams={profile?.favoriteTeams ?? []}
      />
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
        {race.raceDate ? ` — ${race.raceDate}` : ""}
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
      <Link href="/archive?by=track" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{circuit.name ?? circuit.circuitId}</h1>
      <div className="mt-4">
        <CircuitCard circuit={circuit} />
      </div>
      <p className="mt-6 text-sm text-neutral-500">
        {races.length} race{races.length === 1 ? "" : "s"} on record here
      </p>
      <div className="mt-3 space-y-2">
        {races.map((r) => {
          const winner = r.results.find((res) => res.position === 1);
          return (
            <Link
              key={r.id}
              href={archiveRaceHref(r.year, r.round)}
              className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
            >
              <div>
                <p className="text-xs text-neutral-500">{r.year}</p>
                <p className="font-semibold text-white">{r.raceName}</p>
              </div>
              {winner && (
                <div className="text-right">
                  <p className="text-xs text-neutral-500">Winner</p>
                  <p className="text-sm font-medium text-white">{winner.driverName}</p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
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
      <Link href="/archive?by=driver" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {Math.min(...years)}–{Math.max(...years)} · {races.length} race{races.length === 1 ? "" : "s"}
      </p>
      <div className="mt-6 space-y-2">
        {races.map((r) => {
          const entry = r.results.find((res) => res.driverId === driverId);
          return (
            <Link
              key={r.id}
              href={archiveRaceHref(r.year, r.round)}
              className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
            >
              <div>
                <p className="text-xs text-neutral-500">{r.year}</p>
                <p className="font-semibold text-white">{r.raceName}</p>
              </div>
              {entry && (
                <div className="text-right">
                  <p className="text-xs text-neutral-500">Finished</p>
                  <p className="text-sm font-medium text-white">{entry.positionText}</p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

async function ArchiveTeamHistory({ teamId }: { teamId: string }) {
  const [team, races] = await Promise.all([getArchiveTeamData(teamId), getArchiveTeamHistoryData(teamId)]);
  if (!team) notFound();

  const years = races.map((r) => r.year);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/archive?by=team" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{team.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {Math.min(...years)}–{Math.max(...years)} · {races.length} race{races.length === 1 ? "" : "s"}
      </p>
      <div className="mt-6 space-y-2">
        {races.map((r) => {
          const winner = r.results.find((res) => res.position === 1);
          return (
            <Link
              key={r.id}
              href={archiveRaceHref(r.year, r.round)}
              className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
            >
              <div>
                <p className="text-xs text-neutral-500">{r.year}</p>
                <p className="font-semibold text-white">{r.raceName}</p>
              </div>
              {winner && (
                <div className="text-right">
                  <p className="text-xs text-neutral-500">Winner</p>
                  <p className="text-sm font-medium text-white">{winner.driverName}</p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    round?: string;
    by?: string;
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

  const { year: yearParam, round: roundParam, by, circuit, driver, team } = await searchParams;
  const year = yearParam ? Number(yearParam) : null;
  const round = roundParam ? Number(roundParam) : null;

  if (year && round) return <ArchiveRace year={year} round={round} />;
  if (year) return <ArchiveSeason year={year} />;
  if (circuit) return <ArchiveCircuitHistory circuitId={circuit} />;
  if (driver) return <ArchiveDriverHistory driverId={driver} />;
  if (team) return <ArchiveTeamHistory teamId={team} />;
  const facet: Facet = by === "track" || by === "driver" || by === "team" ? by : "year";
  return <ArchiveIndex by={facet} uid={session.uid} />;
}
