import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveRaceList } from "@/components/archive/ArchiveRaceList";
import { ArchiveResultsTable } from "@/components/archive/ArchiveResultsTable";
import { ArchiveSeasonGrid } from "@/components/archive/ArchiveSeasonGrid";
import { SignInGate } from "@/components/auth/SignInGate";
import {
  ARCHIVE_EARLIEST_YEAR,
  ARCHIVE_LATEST_YEAR,
  getArchiveRaceData,
  getArchiveSeasonData,
  getArchiveYears,
} from "@/archive/services/archive.service";
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
      </p>
      <div className="mt-8">
        <ArchiveResultsTable results={race.results} />
      </div>
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
