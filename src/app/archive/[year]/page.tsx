import Link from "next/link";
import { ArchiveRaceList } from "../components/ArchiveRaceList";
import { ArchiveYearStandings } from "../components/ArchiveYearStandings";
import { ARCHIVE_EARLIEST_YEAR, ARCHIVE_LATEST_YEAR, getArchiveSeasonData } from "../services/archive.service";
import { computeArchiveStandings } from "@/lib/archiveStandings";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";

/** The historical counterpart to /season/page.tsx - same header hierarchy (big year + small
 * uppercase label, then a data-driven state line), same Championship-section-then-races-section
 * structure. Unlike /season, there's no `if` needed anywhere here for the season-complete state:
 * every year this route can ever be reached with is <= ARCHIVE_LATEST_YEAR (currentYear - 1) by
 * construction (see src/lib/supabase/archive.ts), so "Season complete" is unconditionally true,
 * not a guess - the in-progress case belongs to /season, not here. */
export default async function ArchiveYearPage({ params }: { params: Promise<{ year: string }> }) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <SignInGate label="the historical archive" />
      </div>
    );
  }

  const { year: yearParam } = await params;
  const year = Number(yearParam);
  const races = await getArchiveSeasonData(year);

  if (races.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Link href="/archive" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Archive
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
        <p className="mt-4 text-sm text-neutral-500">
          {year < ARCHIVE_EARLIEST_YEAR || year > ARCHIVE_LATEST_YEAR
            ? `The archive covers ${ARCHIVE_EARLIEST_YEAR}–${ARCHIVE_LATEST_YEAR}.`
            : "No results backfilled for this season yet."}
        </p>
      </div>
    );
  }

  const { drivers, constructors } = computeArchiveStandings(races);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/archive" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <div className="mt-2 mb-8">
        <h1 className="flex items-baseline gap-3">
          <span className="text-5xl font-bold tracking-tight text-white sm:text-6xl">{year}</span>
          <span className="text-sm font-semibold uppercase tracking-[0.25em] text-neutral-500">Season</span>
        </h1>
        <p className="mt-3 text-sm text-neutral-500">
          <span className="font-medium text-neutral-300">{races.length}</span> race{races.length === 1 ? "" : "s"} · Season complete
        </p>
      </div>

      <ArchiveYearStandings year={year} drivers={drivers} constructors={constructors} />

      <div className="mt-10">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Races</p>
        <ArchiveRaceList year={year} races={races} />
      </div>
    </div>
  );
}
