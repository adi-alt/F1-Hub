import type { FavoriteEntity } from "@/components/profile/FavoriteEntityList";
import { PersonalizationTabs, type Tab } from "@/components/profile/PersonalizationTabs";
import { SignInGate } from "@/components/auth/SignInGate";
import { getAllArchiveCircuits, getAllArchiveDrivers, getAllArchiveTeams } from "@/lib/firestore/archive";
import { getUserProfile } from "@/lib/firestore/users";
import { archiveCircuitHref, archiveDriverHref, archiveTeamHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

const VALID_TABS: Tab[] = ["players", "teams", "circuits"];

// Only "personalisation" is implemented as a section here — notifications/edit-profile stay at
// their own /profile/notifications and /profile/edit routes for now. Defaults to it when no
// section is given at all, since it's the only thing this route currently renders.
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col px-4 py-6 sm:px-6">
        <SignInGate label="personalization" />
      </div>
    );
  }

  const { tab } = await searchParams;
  const initialTab: Tab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : "players";

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
    <div className="mx-auto flex h-full max-w-4xl flex-col px-4 py-6 sm:px-6">
      <h1 className="shrink-0 text-3xl font-bold text-white">Personalization</h1>
      <p className="mt-2 shrink-0 text-sm text-neutral-400">
        Favorite any driver, team, or circuit — current or historical. Favorited ones always show
        up first; everything else follows most-recent-first.
      </p>

      <div className="mt-4 flex flex-1 flex-col overflow-hidden">
        <PersonalizationTabs
          initialTab={initialTab}
          players={{ items: driverItems, favoriteIds: profile?.favoriteDrivers ?? [] }}
          teams={{ items: teamItems, favoriteIds: profile?.favoriteTeams ?? [] }}
          circuits={{ items: circuitItems, favoriteIds: profile?.favoriteTracks ?? [] }}
        />
      </div>
    </div>
  );
}
