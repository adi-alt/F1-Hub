import Link from "next/link";
import { PersonalizationForm } from "@/components/profile/PersonalizationForm";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRacesByYear } from "@/lib/firestore/races";
import { getUserProfile } from "@/lib/firestore/users";
import { getSession } from "@/lib/session/getSession";

export default async function PersonalizationPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <SignInGate label="personalization" />
      </div>
    );
  }

  const [profile, races] = await Promise.all([getUserProfile(session.uid), getRacesByYear(new Date().getFullYear())]);

  // The most recent race with a real grid — results if one's happened, otherwise the next
  // race's qualifying-based inputs — gives an accurate, always-current driver/team list without
  // needing a hardcoded roster that goes stale every time a seat changes.
  const withEntrants = [...races].reverse().find((r) => (r.results?.length ?? 0) > 0 || (r.inputs?.length ?? 0) > 0);
  const entrants = withEntrants?.results?.length
    ? withEntrants.results.map((r) => ({ driver: r.driver, driverName: r.driverName, team: r.team }))
    : (withEntrants?.inputs ?? []).map((i) => ({ driver: i.driver, driverName: i.driverName, team: i.team }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">Personalization</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Pick a favorite driver and team — used to highlight them across the site.
      </p>
      <div className="mt-8">
        <PersonalizationForm
          entrants={entrants}
          initialFavoriteDriver={profile?.favoriteDriver}
          initialFavoriteTeam={profile?.favoriteTeam}
        />
      </div>
    </div>
  );
}
