import Link from "next/link";
import { SeasonDetail } from "@/app/season/_components/SeasonDetail";
import { getSeasonDetailData } from "@/app/season/_service/season.service";
import { ARCHIVE_EARLIEST_YEAR, ARCHIVE_LATEST_YEAR } from "../services/archive.service";
import { FavoritesHydrator } from "@/components/FavoritesHydrator";

/** The historical counterpart to /season/page.tsx - not a separate implementation, the exact same
 * SeasonDetail component, fed by getSeasonDetailData's archive-backed branch instead of the live
 * one. Rendered inline from /archive?year=<year> (the canonical route - archive is a
 * query-parameterized browsing page, not a path hierarchy). */
export async function ArchiveYearView({ year, uid }: { year: number; uid: string }) {
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

  const data = await getSeasonDetailData(year, uid);

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
      <FavoritesHydrator uid={uid} driverIds={data.favoriteDriverIds} teamIds={data.favoriteTeamIds} />
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
