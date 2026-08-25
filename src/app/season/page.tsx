import { SeasonCalendarHeatmap } from "./components/SeasonCalendarHeatmap";
import { ConstructorStandingsTable, DriverStandingsTable } from "./components/StandingsTables";
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
  const { calendarEntries, drivers, constructors, favoriteDriverIds, favoriteTeamIds } = await getSeasonPageData(year, session.uid);

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
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Calendar</h2>
        <SeasonCalendarHeatmap year={year} entries={calendarEntries} />
      </div>
    </div>
  );
}
