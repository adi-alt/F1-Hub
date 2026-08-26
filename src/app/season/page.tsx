import { AnalysisWorkspace } from "./components/AnalysisWorkspace";
import { ChampionshipStandings } from "./components/ChampionshipStandings";
import { SeasonExplorerProvider } from "./components/SeasonExplorerContext";
import { SeasonFavoritesProvider } from "./components/SeasonFavoritesContext";
import { SeasonTimeline } from "./components/SeasonTimeline";
import { getSeasonPageData } from "./services/season.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";

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

  const { year: yearParam } = await searchParams;
  const year = Number(yearParam) || new Date().getFullYear();
  const { drivers, constructors, progression, raceSummaries, racesCompleted, racesRemaining, battles, records, favoriteDriverIds, favoriteTeamIds } =
    await getSeasonPageData(year, session.uid);

  // The favorite driver (if any) is the sensible default Compare selection, per the "subtle
  // personalization" rule — it changes a default, it doesn't build a whole section of its own.
  const favoriteDriver = drivers.find((d) => d.favoriteId && favoriteDriverIds.includes(d.favoriteId));
  const defaultA = favoriteDriver ?? drivers[0];
  const defaultAIndex = defaultA ? drivers.indexOf(defaultA) : -1;
  const defaultB = drivers[defaultAIndex === 0 ? 1 : Math.max(defaultAIndex - 1, 0)];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <SeasonFavoritesProvider initialDriverIds={favoriteDriverIds} initialTeamIds={favoriteTeamIds}>
        <SeasonExplorerProvider defaultCompareA={defaultA?.driver ?? ""} defaultCompareB={defaultB?.driver ?? ""}>
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white">{year} Season</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {racesCompleted} race{racesCompleted === 1 ? "" : "s"} completed · {racesRemaining} remaining
            </p>
          </div>

          <ChampionshipStandings drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />

          <div className="mt-6">
            <AnalysisWorkspace battles={battles} records={records} drivers={drivers} constructors={constructors} progression={progression} raceSummaries={raceSummaries} />
          </div>

          <div className="mt-6">
            <SeasonTimeline year={year} raceSummaries={raceSummaries} />
          </div>
        </SeasonExplorerProvider>
      </SeasonFavoritesProvider>
    </div>
  );
}
