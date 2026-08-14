import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveRaceList } from "./components/ArchiveRaceList";
import { ArchiveSeasonGrid } from "./components/ArchiveSeasonGrid";
import { CircuitCard } from "./components/CircuitCard";
import { LapChart } from "./components/LapChart";
import { PitStopsTimeline } from "./components/PitStopsTimeline";
import { QualifyingBarChart } from "./components/QualifyingBarChart";
import { ResultsBoard } from "./components/ResultsBoard";
import {
  ARCHIVE_EARLIEST_YEAR,
  ARCHIVE_LATEST_YEAR,
  getArchiveCircuitData,
  getArchiveRaceData,
  getArchiveSeasonData,
  getArchiveYears,
} from "./services/archive.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { archiveSeasonHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

function ArchiveIndex() {
  const years = getArchiveYears();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Archive</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every season from {ARCHIVE_EARLIEST_YEAR} to {ARCHIVE_LATEST_YEAR} — results only, sourced
        from the Ergast/Jolpi historical database rather than FastF1 (which only goes back to 2018).
      </p>
      <ArchiveSeasonGrid years={years} />
    </div>
  );
}

async function ArchiveSeason({ year }: { year: number }) {
  const races = await getArchiveSeasonData(year);
  if (races.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link href="/archive" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Archive
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
        <p className="mt-4 text-sm text-neutral-500">No results backfilled for this season yet.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
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

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; round?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="the historical archive" />
      </div>
    );
  }

  const { year: yearParam, round: roundParam } = await searchParams;
  const year = yearParam ? Number(yearParam) : null;
  const round = roundParam ? Number(roundParam) : null;

  if (year && round) return <ArchiveRace year={year} round={round} />;
  if (year) return <ArchiveSeason year={year} />;
  return <ArchiveIndex />;
}
