import { redirect } from "next/navigation";
import { SeasonDetail } from "./_components/SeasonDetail";
import { getSeasonDetailData } from "./_service/season.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { FavoritesHydrator } from "@/components/FavoritesHydrator";
import { getSession } from "@/lib/session/getSession";
import { archiveSeasonHref } from "@/lib/routes";

export default async function SeasonPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
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
  const { year: yearParam } = await searchParams;
  const requestedYear = yearParam ? Number(yearParam) : null;
  if (requestedYear && requestedYear !== currentYear && requestedYear < currentYear) {
    redirect(archiveSeasonHref(requestedYear));
  }
  const year = currentYear;
  const data = await getSeasonDetailData(year, session.uid);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <FavoritesHydrator uid={session.uid} driverIds={data.favoriteDriverIds} teamIds={data.favoriteTeamIds} />
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
      />
    </div>
  );
}
