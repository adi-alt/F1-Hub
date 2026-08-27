import type { FavoriteEntity } from "@/components/profile/FavoriteEntityList";
import { PersonalizationTabs, type Tab } from "@/components/profile/PersonalizationTabs";
import { SignInGate } from "@/components/auth/SignInGate";
import { RaceRealtimeWatcher } from "@/components/RaceRealtimeWatcher";
import { getAllArchiveCircuits, getAllArchiveDrivers, getAllArchiveTeams, getArchiveTeamHomeCircuits } from "@/lib/supabase/archive";
import { getCurrentEntrants, getRacesByYear } from "@/lib/supabase/races";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { safeRead } from "@/lib/safeRead";
import { archiveSlugForCurrentTeam, teamSlug } from "@/lib/teamSlug";
import { getUserProfile } from "@/lib/supabase/users";
import { archiveCircuitHref, archiveDriverHref, archiveTeamHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

const VALID_TABS: Tab[] = ["players", "teams", "circuits"];

/** Same aliasing as archiveSlugForCurrentTeam, but for display: a driver's Companies list
 * should say "Red Bull" for every year they drove there, not "Red Bull, Red Bull Racing" just
 * because this year's data uses the live season's own name for it. */
function canonicalTeamName(rawName: string, teamItems: FavoriteEntity[]): string {
  const slug = archiveSlugForCurrentTeam(rawName);
  return teamItems.find((t) => t.id === slug)?.name ?? rawName;
}

/** The archive only covers seasons through last year by design (this one isn't over yet, so it's
 * never "archived") — but someone personalizing today obviously wants this year's names pickable
 * too. Merges the current season's entrants/teams/circuits into the archive-sourced lists: an
 * exact name (or, for teams, slug) match updates that existing row's year span/race count in
 * place; anything genuinely new this season (a rookie, a new entrant) becomes its own row. */
async function mergeCurrentSeason(
  driverItems: FavoriteEntity[],
  teamItems: FavoriteEntity[],
  circuitItems: FavoriteEntity[],
  circuitLocalities: Map<string, string>,
) {
  const year = new Date().getFullYear();
  const [races, entrants] = await Promise.all([getRacesByYear(year), getCurrentEntrants(year)]);
  const completed = races.filter((r) => r.status === "completed");

  const driverStats = new Map<string, { name: string; raceCount: number; teams: Set<string> }>();
  const teamStats = new Map<string, { name: string; raceCount: number }>();
  for (const race of completed) {
    const teamsThisRace = new Set<string>();
    for (const result of race.results ?? []) {
      const d = driverStats.get(result.driver) ?? { name: result.driverName, raceCount: 0, teams: new Set() };
      d.raceCount += 1;
      d.teams.add(canonicalTeamName(result.team, teamItems));
      driverStats.set(result.driver, d);

      teamsThisRace.add(result.team);
    }
    for (const team of teamsThisRace) {
      const t = teamStats.get(team) ?? { name: team, raceCount: 0 };
      t.raceCount += 1;
      teamStats.set(team, t);
    }
  }
  for (const e of entrants) {
    if (!driverStats.has(e.driver)) {
      driverStats.set(e.driver, { name: e.driverName, raceCount: 0, teams: new Set([canonicalTeamName(e.team, teamItems)]) });
    }
    if (!teamStats.has(e.team)) teamStats.set(e.team, { name: e.team, raceCount: 0 });
  }

  const circuitRaceCount = new Map<string, number>();
  for (const race of completed) circuitRaceCount.set(race.circuit, (circuitRaceCount.get(race.circuit) ?? 0) + 1);

  const driversByName = new Map(driverItems.map((d) => [d.name.trim().toLowerCase(), d]));
  for (const [code, stats] of driverStats) {
    const existing = driversByName.get(stats.name.trim().toLowerCase());
    if (existing) {
      existing.lastYear = year;
      existing.raceCount += stats.raceCount;
      existing.extra = [...new Set([...(existing.extra ? existing.extra.split(", ") : []), ...stats.teams])].join(", ");
    } else {
      const item: FavoriteEntity = {
        id: code,
        name: stats.name,
        firstYear: year,
        lastYear: year,
        raceCount: stats.raceCount,
        extra: [...stats.teams].join(", "),
        href: archiveDriverHref(code),
      };
      driverItems.push(item);
      driversByName.set(stats.name.trim().toLowerCase(), item);
    }
  }

  // Home circuit (this team's most-raced circuit historically) is archive-derived and doesn't
  // need updating from one extra current-season race — only year span/race count change here.
  const teamsBySlug = new Map(teamItems.map((t) => [t.id, t]));
  for (const [name, stats] of teamStats) {
    const slug = archiveSlugForCurrentTeam(name);
    const existing = teamsBySlug.get(slug);
    if (existing) {
      existing.lastYear = year;
      existing.raceCount += stats.raceCount;
    } else {
      const item: FavoriteEntity = {
        id: slug,
        name,
        firstYear: year,
        lastYear: year,
        raceCount: stats.raceCount,
        extra: "",
        href: archiveTeamHref(slug),
      };
      teamItems.push(item);
      teamsBySlug.set(slug, item);
    }
  }

  const circuitsById = new Map(circuitItems.map((c) => [c.id, c]));
  const circuitsByName = new Map(circuitItems.map((c) => [c.name.trim().toLowerCase(), c]));
  const circuitIdsByName = new Map(circuitItems.map((c) => [c.name.trim().toLowerCase(), c.id]));
  for (const [location, raceCount] of circuitRaceCount) {
    const key = location.trim().toLowerCase();
    const resolvedId = resolveCurrentCircuitToArchiveId(location, circuitLocalities, circuitIdsByName);
    const existing = (resolvedId ? circuitsById.get(resolvedId) : undefined) ?? circuitsByName.get(key);
    if (existing) {
      existing.lastYear = year;
      existing.raceCount += raceCount;
    } else {
      const id = teamSlug(location);
      const item: FavoriteEntity = {
        id,
        name: location,
        firstYear: year,
        lastYear: year,
        raceCount,
        extra: "",
        href: archiveCircuitHref(id),
      };
      circuitItems.push(item);
      circuitsById.set(id, item);
      circuitsByName.set(location.trim().toLowerCase(), item);
    }
  }
}

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
      <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl flex-col px-4 py-6 sm:px-6">
        <SignInGate label="personalization" />
      </div>
    );
  }

  const { tab } = await searchParams;
  const initialTab: Tab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : "players";
  const uid = session.uid;

  // A Firestore outage (quota, transient error, anything) degrades this page to empty tabs
  // instead of crashing it outright — same reasoning as archive/page.tsx's ArchiveIndex.
  const [profile, drivers, teams, circuits, teamHomeCircuits] = await Promise.all([
    safeRead(() => getUserProfile(uid), null),
    safeRead(() => getAllArchiveDrivers(), []),
    safeRead(() => getAllArchiveTeams(), []),
    safeRead(() => getAllArchiveCircuits(), []),
    safeRead(() => getArchiveTeamHomeCircuits(), {}),
  ]);

  // One list per entity type, spanning the full archive (1950-last year) plus this year's own
  // season (merged in below) — not just this year's grid alone — so a fan of a retired driver or
  // a long-gone team can still find and favorite them, and this year's names show up too. Same
  // favoriteDrivers/Teams/Tracks arrays the archive's own heart icons and signup's quick pick
  // both write into; there's no second copy of this data anywhere.
  const driverItems: FavoriteEntity[] = drivers.map((d) => ({
    id: d.driverId,
    name: d.name,
    firstYear: d.firstYear,
    lastYear: d.lastYear,
    raceCount: d.raceCount,
    extra: d.constructors?.join(", ") ?? "",
    href: archiveDriverHref(d.driverId),
  }));
  const teamItems: FavoriteEntity[] = teams.map((t) => ({
    id: t.teamId,
    name: t.name,
    firstYear: t.firstYear,
    lastYear: t.lastYear,
    raceCount: t.raceCount,
    extra: teamHomeCircuits[t.teamId] ?? "",
    href: archiveTeamHref(t.teamId),
  }));
  const circuitItems: FavoriteEntity[] = circuits.map((c) => ({
    id: c.circuitId,
    name: c.name ?? c.circuitId,
    firstYear: c.firstYear ?? 0,
    lastYear: c.lastYear ?? 0,
    raceCount: c.raceCount ?? 0,
    extra: c.country ?? "",
    href: archiveCircuitHref(c.circuitId),
  }));
  const circuitLocalities = new Map(circuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));

  // Best-effort: if the current season's own data can't be read right now, the page still shows
  // the full archive-only lists rather than crashing over one extra merge step.
  try {
    await mergeCurrentSeason(driverItems, teamItems, circuitItems, circuitLocalities);
  } catch (error) {
    console.error("ProfilePage: current-season merge failed, showing archive-only data:", error);
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl flex-col px-4 py-6 sm:px-6">
      <RaceRealtimeWatcher />
      <h1 className="shrink-0 text-3xl font-bold text-white">Personalization</h1>
      <p className="mt-2 shrink-0 text-sm text-neutral-400">
        Favorite any driver, team, or circuit, current or historical. Favorited ones always show
        up first, then everything else, most recent first.
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <PersonalizationTabs
          initialTab={initialTab}
          players={{ items: driverItems, favoriteIds: profile?.favoriteDrivers ?? [] }}
          teams={{ items: teamItems, favoriteIds: profile?.favoriteTeams ?? [] }}
          circuits={{ items: circuitItems, favoriteIds: profile?.favoriteTracks ?? [] }}
        />
      </div>
      <div className="shrink-0 pb-2" />
    </div>
  );
}
