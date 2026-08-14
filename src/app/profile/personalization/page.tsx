import Link from "next/link";
import { PersonalizationForm } from "@/components/profile/PersonalizationForm";
import { SignInGate } from "@/components/auth/SignInGate";
import { getCurrentEntrants, getRacesByYear } from "@/lib/firestore/races";
import { getUserProfile } from "@/lib/firestore/users";
import { getSession } from "@/lib/session/getSession";
import { computeStandings } from "@/lib/standings";

export default async function PersonalizationPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <SignInGate label="personalization" />
      </div>
    );
  }

  const year = new Date().getFullYear();
  const [profile, races, entrants] = await Promise.all([
    getUserProfile(session.uid),
    getRacesByYear(year),
    getCurrentEntrants(year),
  ]);

  // Same completed-races-only standings the season page shows — reused here so picking a
  // favorite immediately shows something real (points, wins, championship position) instead of
  // just silently recording a string nobody ever sees again.
  const standings = computeStandings(races);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">Personalization</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Pick your favorite drivers and teams — used to highlight them across the site. (Favorite
        tracks are managed from the archive&apos;s &ldquo;By track&rdquo; tab.)
      </p>
      <div className="mt-8">
        <PersonalizationForm
          entrants={entrants}
          driverStandings={standings.drivers}
          constructorStandings={standings.constructors}
          initialFavoriteDrivers={profile?.favoriteDrivers}
          initialFavoriteTeams={profile?.favoriteTeams}
        />
      </div>
    </div>
  );
}
