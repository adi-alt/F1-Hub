import Link from "next/link";
import { Suspense } from "react";
import { SeasonDetail } from "@/app/season/_components/SeasonDetail";
import { getSeasonDetailData } from "@/app/season/_service/season.service";
import { ARCHIVE_EARLIEST_YEAR, archiveLatestYear } from "../services/archive.service";
import { getCurrentSeason } from "@/lib/currentSeason";
import { FavoritesHydrator } from "@/components/FavoritesHydrator";
import { SeasonDetailSkeleton } from "@/components/ui/SeasonDetailSkeleton";

/** The historical counterpart to /season/page.tsx - not a separate implementation, the exact same
 * SeasonDetail component, fed by getSeasonDetailData's archive-backed branch instead of the live
 * one. Rendered inline from /archive?year=<year> (the canonical route - archive is a
 * query-parameterized browsing page, not a path hierarchy). */
export async function ArchiveYearView({ year, uid }: { year: number; uid: string }) {
  const latestYear = archiveLatestYear(await getCurrentSeason());
  if (year < ARCHIVE_EARLIEST_YEAR || year > latestYear) {
    return (
      <div className="page-content py-10">
        <Link href="/archive" className="text-sm text-tertiary hover:text-neutral-300">
          ← Archive
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
        <p className="mt-4 text-sm text-tertiary">The archive covers {ARCHIVE_EARLIEST_YEAR}–{latestYear}.</p>
      </div>
    );
  }

  const data = await getSeasonDetailData(year, uid);

  if (data.raceSummaries.length === 0) {
    return (
      <div className="page-content py-10">
        <Link href="/archive" className="text-sm text-tertiary hover:text-neutral-300">
          ← Archive
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
        <p className="mt-4 text-sm text-tertiary">No results backfilled for this season yet.</p>
      </div>
    );
  }

  return (
    <div className="page-content py-10">
      <FavoritesHydrator uid={uid} driverIds={data.favoriteDriverIds} teamIds={data.favoriteTeamIds} />
      {/* Same Suspense boundary /season uses, for the same reason: SeasonDetail's tree reads the
          race-window round from the query string. */}
      <Suspense fallback={<SeasonDetailSkeleton />}>
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
          favoriteTeamIds={data.favoriteTeamIds}
        />
      </Suspense>
    </div>
  );
}
