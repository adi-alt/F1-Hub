import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SeasonDetail } from "./_components/SeasonDetail";
import { getSeasonDetailData } from "./_service/season.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { FavoritesHydrator } from "@/components/FavoritesHydrator";
import { getSession } from "@/lib/session/getSession";
import { archiveSeasonHref } from "@/lib/routes";
import { SeasonDetailSkeleton } from "@/components/ui/SeasonDetailSkeleton";

export const metadata: Metadata = {
  title: "Season",
  description: "Standings, results, and predictions for the current F1 season, round by round.",
};

export default async function SeasonPage({
  searchParams,
}: {
  // `race` is the open race window's round - the window's state IS the URL (see
  // SeasonExplorerProvider), which is what makes it survive a hard refresh and respond to the
  // browser's back button. The server doesn't read it; it's declared so this type still describes
  // the route's real contract rather than half of it.
  searchParams: Promise<{ year?: string; race?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="season standings" />
      </div>
    );
  }

  // This page only ever shows the live, in-progress season - the favoriting, predictions, and
  // "next round" framing throughout it don't make sense for a season that's already over. A `year`
  // in the URL pointing at a past season goes to /archive instead of quietly rendering here (a
  // stale bookmark, a hand-edited URL); a future/garbage value just falls back to the current year
  // rather than erroring on it.
  const currentYear = new Date().getFullYear();
  const { year: yearParam, race: raceParam } = await searchParams;
  const requestedYear = yearParam ? Number(yearParam) : null;
  if (requestedYear && requestedYear !== currentYear && requestedYear < currentYear) {
    // Carry the open race across the redirect. Archive renders the same SeasonDetail, race window
    // included, so dropping it would silently close a window the user had linked to.
    const target = archiveSeasonHref(requestedYear);
    redirect(raceParam ? `${target}&race=${encodeURIComponent(raceParam)}` : target);
  }
  const year = currentYear;
  const data = await getSeasonDetailData(year, session.uid);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <FavoritesHydrator uid={session.uid} driverIds={data.favoriteDriverIds} teamIds={data.favoriteTeamIds} />
      <Suspense fallback={<SeasonDetailSkeleton />}>
        <SeasonDetail
          year={year}
          status={data.status}
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
