import Link from "next/link";
import { FavoritesFromArchive, type FavoriteItem } from "@/components/profile/FavoritesFromArchive";
import { PersonalizationForm } from "@/components/profile/PersonalizationForm";
import { SignInGate } from "@/components/auth/SignInGate";
import { getArchiveCircuit, getArchiveDriver, getArchiveTeam } from "@/lib/firestore/archive";
import { getCurrentEntrants, getRacesByYear } from "@/lib/firestore/races";
import { getUserProfile } from "@/lib/firestore/users";
import { archiveCircuitHref, archiveDriverHref, archiveTeamHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";
import { computeStandings } from "@/lib/standings";

/** Resolves whichever of a user's favoriteDrivers/Teams/Tracks ids actually belong to the
 * archive's id scheme (Ergast driverId slugs, team-name slugs, circuitId slugs) — current-season
 * ids from the chip picker below (FastF1 codes, free-text team names) simply won't resolve
 * against these collections and are silently skipped here, since they're already shown via the
 * chip UI. */
async function resolveArchiveFavorites(profile: {
  favoriteDrivers?: string[];
  favoriteTeams?: string[];
  favoriteTracks?: string[];
} | null): Promise<{ drivers: FavoriteItem[]; teams: FavoriteItem[]; tracks: FavoriteItem[] }> {
  const [drivers, teams, tracks] = await Promise.all([
    Promise.all((profile?.favoriteDrivers ?? []).map((id) => getArchiveDriver(id))),
    Promise.all((profile?.favoriteTeams ?? []).map((id) => getArchiveTeam(id))),
    Promise.all((profile?.favoriteTracks ?? []).map((id) => getArchiveCircuit(id))),
  ]);
  return {
    drivers: drivers
      .filter((d) => d !== null)
      .map((d) => ({ id: d.driverId, name: d.name, href: archiveDriverHref(d.driverId) })),
    teams: teams
      .filter((t) => t !== null)
      .map((t) => ({ id: t.teamId, name: t.name, href: archiveTeamHref(t.teamId) })),
    tracks: tracks
      .filter((c) => c !== null)
      .map((c) => ({ id: c.circuitId, name: c.name ?? c.circuitId, href: archiveCircuitHref(c.circuitId) })),
  };
}

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
  const archiveFavorites = await resolveArchiveFavorites(profile);

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
        Pick your favorite drivers and teams — used to highlight them across the site.
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

      <div className="mt-10 border-t border-[var(--f1-line)] pt-8">
        <h2 className="text-lg font-semibold text-white">Marked as favorite</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Tracks, drivers, and teams you&apos;ve favorited from the{" "}
          <Link href="/archive" className="text-[var(--f1-red)] hover:underline">
            archive
          </Link>
          .
        </p>
        <div className="mt-4">
          <FavoritesFromArchive
            drivers={archiveFavorites.drivers}
            teams={archiveFavorites.teams}
            tracks={archiveFavorites.tracks}
          />
        </div>
      </div>
    </div>
  );
}
