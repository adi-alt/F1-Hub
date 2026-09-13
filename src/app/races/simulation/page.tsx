import { notFound, redirect } from "next/navigation";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRace } from "@/lib/supabase/races";
import { raceHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

/** Redirect shim - the simulator is now a tab on the race's own page (only shown when
 * race.simulation actually exists), not a separate route. `?tab=simulation` lands directly on it. */
export default async function LegacyRaceSimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; round?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="the race simulator" />
      </div>
    );
  }

  const { year, round } = await searchParams;
  if (!year || !round) notFound();

  const race = await getRace(Number(year), Number(round));
  if (!race) notFound();

  redirect(raceHref(race.year, race.round, race.name, "simulation"));
}
