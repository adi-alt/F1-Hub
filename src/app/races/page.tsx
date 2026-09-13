import { notFound, redirect } from "next/navigation";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRace } from "@/lib/supabase/races";
import { raceHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

/** Redirect shim - every race now opens on its own route (/season/<year>/race/<slug>), replacing
 * this query-param page. Kept so an old bookmark/shared link (?year=&round=[&section=]) still
 * lands somewhere real instead of 404ing outright. Session-checked before the lookup, same as
 * every other data read in the app - the destination page re-checks anyway, but there's no reason
 * for this shim to be the one exception that reads race data before confirming a real session. */
export default async function LegacyRacePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; round?: string; section?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="this race" />
      </div>
    );
  }

  const { year, round, section } = await searchParams;
  if (!year || !round) notFound();

  const race = await getRace(Number(year), Number(round));
  if (!race) notFound();

  redirect(raceHref(race.year, race.round, race.name, section));
}
