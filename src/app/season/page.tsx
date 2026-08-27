import { AnalysisWorkspace } from "./_components/AnalysisWorkspace";
import { ChampionshipStandings } from "./_components/ChampionshipStandings";
import { SeasonCalendar } from "./_components/SeasonCalendar";
import { SeasonExplorerProvider } from "./_context/SeasonExplorerContext";
import { getSeasonPageData } from "./_service/season.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { FavoritesHydrator } from "@/components/FavoritesHydrator";
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
  const currentRound = raceSummaries.find((r) => r.state === "next");

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <FavoritesHydrator uid={session.uid} driverIds={favoriteDriverIds} teamIds={favoriteTeamIds} />
      <SeasonExplorerProvider defaultCompareA={defaultA?.driver ?? ""} defaultCompareB={defaultB?.driver ?? ""}>
        <div className="mb-8">
          <h1 className="flex items-baseline gap-3">
            <span className="text-5xl font-bold tracking-tight text-white sm:text-6xl">{year}</span>
            <span className="text-sm font-semibold uppercase tracking-[0.25em] text-neutral-500">Season</span>
          </h1>
          <p className="mt-3 text-sm text-neutral-500">
            <span className="font-medium text-neutral-300">{racesCompleted}</span> round{racesCompleted === 1 ? "" : "s"} complete ·{" "}
            {racesRemaining} remaining
          </p>
          {currentRound && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
              <span className="pulse-ring h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" />
              Round {currentRound.round} · {currentRound.name}
            </p>
          )}
        </div>

        <ChampionshipStandings drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />

        <div className="mt-8">
          <AnalysisWorkspace battles={battles} records={records} drivers={drivers} constructors={constructors} progression={progression} raceSummaries={raceSummaries} />
        </div>

        <div className="mt-8">
          <SeasonCalendar year={year} drivers={drivers} raceSummaries={raceSummaries} />
        </div>
      </SeasonExplorerProvider>
    </div>
  );
}
