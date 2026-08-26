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

  // Both asides get an invisible copy of the first real heading's own box (same classes, so its
  // height/margin match exactly) instead of a guessed pixel offset — that's what actually lines
  // the rails' top up with the table's top rather than the heading above it.
  const headingSpacer = (
    <h2 aria-hidden className="invisible mb-3 text-lg font-semibold">
      &nbsp;
    </h2>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6">
      <div className="xl:grid xl:grid-cols-[300px_minmax(0,1fr)_300px] xl:items-start xl:gap-6">
        <aside className="hidden xl:sticky xl:top-24 xl:block">
          {headingSpacer}
          <YourSeasonWidget drivers={drivers} constructors={constructors} favoriteDriverIds={favoriteDriverIds} favoriteTeamIds={favoriteTeamIds} />
        </aside>

        <div className="mx-auto w-full max-w-5xl">
          <div className="space-y-10">
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
                <div className="glass rounded-xl border border-[var(--f1-line)] p-4 sm:p-6">
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
          {headingSpacer}
          <SeasonPulseWidget facts={facts} drivers={drivers} />
        </aside>
      </div>
    </div>
  );
}
