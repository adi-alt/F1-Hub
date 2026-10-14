import { notFound, redirect } from "next/navigation";
import { SignInGate } from "@/components/auth/SignInGate";
import { getNextUpcomingRace, getRace } from "@/lib/supabase/races";
import { getCurrentSeason } from "@/lib/currentSeason";
import { raceHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

/** Redirect shim - the race simulator (10,000 simulated races from the grid, race pace and retirement odds) lives on
 * each race's own page now, not a separate route. With a year and round, that race; without (the footer's "Race
 * simulator" link), the next race - it used to 404. */
export default async function LegacyRaceSimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; round?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-content py-10">
        <SignInGate label="the race simulator" />
      </div>
    );
  }

  const { year, round } = await searchParams;
  if (!year || !round) {
    const next = await getNextUpcomingRace(await getCurrentSeason());
    if (!next) notFound();
    // The race page has no tabs any more; its "What the model expects" section is #prediction before the race.
    redirect(`${raceHref(next.year, next.round, next.name)}#prediction`);
  }

  const race = await getRace(Number(year), Number(round));
  if (!race) notFound();

  redirect(`${raceHref(race.year, race.round, race.name)}#${race.status === "completed" ? "simulation" : "prediction"}`);
}
