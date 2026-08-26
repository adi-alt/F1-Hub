import { SeasonCalendarHeatmap } from "./components/SeasonCalendarHeatmap";
import { SeasonPulseWidget, YourSeasonWidget } from "./components/SeasonSidebarWidgets";
import { ConstructorStandingsTable, DriverStandingsTable } from "./components/StandingsTables";
import { getSeasonPageData } from "./services/season.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { StandingsWidget } from "@/components/home/StandingsWidget";
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
  const { calendarEntries, drivers, constructors, progression, top3ByRound, facts, favoriteDriverIds, favoriteTeamIds } = await getSeasonPageData(
    year,
    session.uid,
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
      {/* Rails only show up from xl: up — below that, the space they'd use is the main column
          itself, not real margin, so there's nothing to reclaim without cramping the tables. */}
      <div className="xl:grid xl:grid-cols-[260px_minmax(0,1fr)_260px] xl:items-start xl:gap-6">
        <aside className="hidden xl:sticky xl:top-24 xl:block">
          <YourSeasonWidget drivers={drivers} constructors={constructors} favoriteDriverIds={favoriteDriverIds} favoriteTeamIds={favoriteTeamIds} />
        </aside>

        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-white">{year} Season</h1>

          <div className="mt-8 space-y-10">
            <div>
              <h2 className="mb-3 text-lg font-semibold text-white">Drivers&apos; Championship</h2>
              <DriverStandingsTable standings={drivers} favoriteIds={favoriteDriverIds} />
            </div>
            <div>
              <h2 className="mb-3 text-lg font-semibold text-white">Constructors&apos; Championship</h2>
              <ConstructorStandingsTable standings={constructors} favoriteIds={favoriteTeamIds} />
            </div>
            {progression.length > 0 && (
              <div>
                <h2 className="mb-3 text-lg font-semibold text-white">Points progression</h2>
                <div className="rounded-xl border border-[var(--f1-line)] p-4 sm:p-6">
                  <StandingsWidget variant="line" drivers={drivers} progression={progression} progressionDrivers={drivers.filter((d) => d.points > 0)} />
                </div>
              </div>
            )}
          </div>

          <div className="mt-10">
            <h2 className="mb-3 text-lg font-semibold text-white">Calendar</h2>
            <SeasonCalendarHeatmap year={year} entries={calendarEntries} top3ByRound={top3ByRound} />
          </div>

          {/* Same rail content, stacked below the main column instead of hidden outright once the
              screen isn't wide enough for a real side rail. */}
          <div className="mt-10 grid gap-6 xl:hidden sm:grid-cols-2">
            <YourSeasonWidget drivers={drivers} constructors={constructors} favoriteDriverIds={favoriteDriverIds} favoriteTeamIds={favoriteTeamIds} />
            <SeasonPulseWidget facts={facts} drivers={drivers} />
          </div>
        </div>

        <aside className="hidden xl:sticky xl:top-24 xl:block">
          <SeasonPulseWidget facts={facts} drivers={drivers} />
        </aside>
      </div>
    </div>
  );
}
