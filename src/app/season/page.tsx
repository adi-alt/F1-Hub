import { CalendarList } from "@/components/season/CalendarList";
import { ConstructorStandingsTable, DriverStandingsTable } from "@/components/season/StandingsTables";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRacesByYear } from "@/lib/firestore/races";
import { getSession } from "@/lib/session/getSession";
import { computeStandings } from "@/lib/standings";

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
  const races = await getRacesByYear(year);
  const standings = computeStandings(races);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">{year} Season</h1>

      <div className="mt-8 space-y-10">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Drivers&apos; Championship</h2>
          <DriverStandingsTable standings={standings.drivers} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Constructors&apos; Championship</h2>
          <ConstructorStandingsTable standings={standings.constructors} />
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Calendar</h2>
        <CalendarList races={races} />
      </div>
    </div>
  );
}
