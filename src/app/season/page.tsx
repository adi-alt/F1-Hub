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
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6">
      {/* No heading above this grid anymore (removed per your last message) — "Drivers'
          Championship" below is now the first thing in the middle column too, so items-start
          already lines every column's top up with it. No spacer needed. */}
      <div className="xl:grid xl:grid-cols-[300px_minmax(0,1fr)_300px] xl:items-start xl:gap-6">
        {/* top-10 matches this page's own py-10 exactly — not a round "looks about right" number.
            The mismatch before (sticky at top-24/96px vs. content starting at py-10/40px) is what
            made the rail jump away from the table the instant it went sticky: sticky pins at
            *its own* top offset regardless of where non-sticky content next to it actually sits,
            so the two only line up when that offset matches the page's real padding. */}
        <aside className="hidden xl:sticky xl:top-10 xl:block">
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
                <div className="glass backdrop-blur-2xl rounded-xl border border-[var(--f1-line)] p-4 sm:p-6">
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

        <aside className="hidden xl:sticky xl:top-10 xl:block">
          <SeasonPulseWidget facts={facts} drivers={drivers} />
        </aside>
      </div>
    </div>
  );
}
