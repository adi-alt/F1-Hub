import { FavoriteEntityList, type FavoriteEntity } from "@/components/profile/FavoriteEntityList";
import { SignInGate } from "@/components/auth/SignInGate";
import { getAllArchiveCircuits, getAllArchiveDrivers, getAllArchiveTeams } from "@/lib/firestore/archive";
import { getUserProfile } from "@/lib/firestore/users";
import { archiveCircuitHref, archiveDriverHref, archiveTeamHref } from "@/lib/routes";
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

  const [profile, drivers, teams, circuits] = await Promise.all([
    getUserProfile(session.uid),
    getAllArchiveDrivers(),
    getAllArchiveTeams(),
    getAllArchiveCircuits(),
  ]);

  // One list per entity type, spanning the full archive (1950-present) — not just this year's
  // grid — so a fan of a retired driver or a long-gone team can still find and favorite them.
  // Same favoriteDrivers/Teams/Tracks arrays the archive's own heart icons and signup's quick
  // pick both write into; there's no second copy of this data anywhere.
  const driverItems: FavoriteEntity[] = drivers.map((d) => ({
    id: d.driverId,
    name: d.name,
    lastYear: d.lastYear,
    raceCount: d.raceCount,
    href: archiveDriverHref(d.driverId),
  }));
  const teamItems: FavoriteEntity[] = teams.map((t) => ({
    id: t.teamId,
    name: t.name,
    lastYear: t.lastYear,
    raceCount: t.raceCount,
    href: archiveTeamHref(t.teamId),
  }));
  const circuitItems: FavoriteEntity[] = circuits.map((c) => ({
    id: c.circuitId,
    name: c.name ?? c.circuitId,
    lastYear: c.lastYear ?? 0,
    raceCount: c.raceCount ?? 0,
    href: archiveCircuitHref(c.circuitId),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Personalization</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Favorite any driver, team, or circuit — current or historical. Favorited ones always show
        up first; everything else follows most-recent-first.
      </p>

      <div className="mt-8 space-y-10">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Players</h2>
          <FavoriteEntityList type="driver" items={driverItems} favoriteIds={profile?.favoriteDrivers ?? []} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Teams</h2>
          <FavoriteEntityList type="team" items={teamItems} favoriteIds={profile?.favoriteTeams ?? []} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Circuits</h2>
          <FavoriteEntityList type="track" items={circuitItems} favoriteIds={profile?.favoriteTracks ?? []} />
        </section>
      </div>
    </div>
  );
}
