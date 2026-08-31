import Link from "next/link";
import { SeasonDetail } from "@/app/season/_components/SeasonDetail";
import { getSeasonDetailData } from "@/app/season/_service/season.service";
import { ARCHIVE_EARLIEST_YEAR, ARCHIVE_LATEST_YEAR } from "../services/archive.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { FavoritesHydrator } from "@/components/FavoritesHydrator";
import { getSession } from "@/lib/session/getSession";

/** The historical counterpart to /season/page.tsx - not a separate implementation, the exact same
 * SeasonDetail component, fed by getSeasonDetailData's archive-backed branch instead of the live
 * one. Archive is the entry point for choosing a year; SeasonDetail is what actually renders it,
 * for both sections alike. */
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

  if (year < ARCHIVE_EARLIEST_YEAR || year > ARCHIVE_LATEST_YEAR) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Link href="/archive" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Archive
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
        <p className="mt-4 text-sm text-neutral-500">The archive covers {ARCHIVE_EARLIEST_YEAR}–{ARCHIVE_LATEST_YEAR}.</p>
      </div>
    );
  }

  const data = await getSeasonDetailData(year, session.uid);

  if (data.raceSummaries.length === 0) {
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
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
      <FavoritesHydrator uid={session.uid} driverIds={data.favoriteDriverIds} teamIds={data.favoriteTeamIds} />
      <SeasonDetail
        year={year}
        status={data.status}
        backHref="/archive"
        drivers={data.drivers}
        constructors={data.constructors}
        progression={data.progression}
        raceSummaries={data.raceSummaries}
        racesCompleted={data.racesCompleted}
        racesRemaining={data.racesRemaining}
        battles={data.battles}
        records={data.records}
        favoriteDriverIds={data.favoriteDriverIds}
      />
    </div>
  );
}
