import { SeasonCalendarHeatmap } from "./components/SeasonCalendarHeatmap";
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
  const { calendarEntries, drivers, constructors, progression, top3ByRound, favoriteDriverIds, favoriteTeamIds } = await getSeasonPageData(
    year,
    session.uid,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
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
              <StandingsWidget variant="line" drivers={drivers} progression={progression} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Calendar</h2>
        <SeasonCalendarHeatmap year={year} entries={calendarEntries} top3ByRound={top3ByRound} />
      </div>
    </div>
  );
}
