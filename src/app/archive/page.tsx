import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArchiveExplorer } from "./components/ArchiveExplorer";
import { ArchiveYearView } from "./components/ArchiveYearView";
import { RetryBanner } from "./components/RetryBanner";
import { ArchiveEntityHeader } from "./components/ArchiveEntityHeader";
import { ArchiveFavoriteToggle } from "./components/ArchiveFavoriteToggle";
import { ArchiveApexScope } from "./components/ArchiveApexScope";
import { ArchiveExplorerWithFocus } from "./components/ArchiveExplorerWithFocus";
import { ArchiveEraTimeline, buildEraSegments } from "./components/ArchiveEraTimeline";
import { ArchiveDriverRelationships, type DriverRelationship } from "./components/ArchiveDriverRelationships";
import type { ExplorerRow, ResultFilter } from "./components/ArchiveRaceExplorer";
import {
  ARCHIVE_EARLIEST_YEAR,
  ARCHIVE_LATEST_YEAR,
  getAllArchiveCircuitsData,
  getAllArchiveDriversData,
  getAllArchiveTeamsData,
  getArchiveCircuitData,
  getArchiveCircuitHistoryData,
  getArchiveDriverData,
  getArchiveDriverHistoryData,
  getArchiveRaceData,
  getArchiveTeamData,
  getArchiveTeamHistoryData,
  getArchiveYearStatsData,
  getArchiveYears,
} from "./services/archive.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import type { ArchiveRaceDoc, ArchiveResultEntry, CurrentLeader } from "@/lib/supabase/archive";
import { getArchiveDriverPhotosByIds } from "@/lib/supabase/archive";
import { getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { computeStandings } from "@/lib/standings";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";
import { getUserProfile } from "@/lib/supabase/users";
import { safeRead, safeReadTracked } from "@/lib/safeRead";
import { raceHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

// Ergast's own three-way classification status (archiveIsClassified in circuitIntelligence.ts
// makes the exact same real distinction, not exported from there - a one-line regex check is
// cheaper duplicated than pulled through a shared module for this).
function isClassified(status: string): boolean {
  return status === "Finished" || /^\+\d+ Lap/.test(status);
}

function finishText(positionText: string): string {
  return /^\d+$/.test(positionText) ? `P${positionText}` : positionText;
}

type Facet = "year" | "track" | "driver" | "team";

// A Firestore outage (quota, transient error, anything) degrades this page to empty
// tabs/favorites instead of crashing it outright — the same "temporarily nothing here" empty
// states these components already show when a pipeline pass genuinely hasn't reached this data
// yet double as the degraded view; nothing new to build for that.
/** Reconciles the current season's own roster against the archive - the same direction of the
 * current-season <-> archive matching problem src/app/profile/page.tsx's mergeCurrentSeason
 * already solves (there: fold this year's names into the archive-sourced favorite lists; here:
 * flag which existing archive circuits/teams are also this year's), reusing the exact same
 * resolver functions rather than writing a second matching implementation. Also derives
 * `currentLeader` from the same current-season fetch, so as not to duplicate it - this year's
 * points leader, computed with the same pure computeStandings the season page itself uses, for
 * the year-card hover tooltip on the in-progress season (which the archive has no rows for at
 * all). Best-effort: if the current season's own data can't be read right now, everything just
 * degrades to "historical, no leader" rather than crashing the whole Archive page over one extra
 * cross-reference. */
async function getActiveIds(
  circuits: Awaited<ReturnType<typeof getAllArchiveCircuitsData>>,
): Promise<{ circuitIds: string[]; teamIds: string[]; currentLeader: CurrentLeader }> {
  const empty = { circuitIds: [], teamIds: [], currentLeader: { driver: null, team: null } };
  try {
    const year = new Date().getFullYear();
    const [races, currentTeams] = await Promise.all([getRacesByYear(year), getAllCurrentTeams()]);
    const circuitLocalities = new Map(circuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
    const circuitIdsByName = new Map(circuits.map((c) => [(c.name ?? c.circuitId).trim().toLowerCase(), c.circuitId]));

    const circuitIds = new Set<string>();
    for (const race of races) {
      const resolved = resolveCurrentCircuitToArchiveId(race.circuit, circuitLocalities, circuitIdsByName);
      if (resolved) circuitIds.add(resolved);
    }
    const teamIds = currentTeams.map((t) => archiveSlugForCurrentTeam(t.name));

    const standings = computeStandings(races);
    const topDriver = standings.drivers[0];
    const topTeam = standings.constructors[0];
    const currentLeader: CurrentLeader = {
      driver: topDriver ? { name: topDriver.driverName, points: topDriver.points } : null,
      team: topTeam ? { name: topTeam.team, points: topTeam.points } : null,
    };

    return { circuitIds: [...circuitIds], teamIds, currentLeader };
  } catch (error) {
    console.error("ArchiveIndex: current-season reconciliation failed, treating everything as historical:", error);
    return empty;
  }
}

async function ArchiveIndex({ section, uid }: { section: Facet; uid: string }) {
  // Circuits and year-stats are unconditionally eager: circuits because getActiveIds' active/
  // historical reconciliation needs the full list regardless of which tab is open (and its own
  // fetch is far cheaper than drivers/teams anyway), year-stats because "By year" - the default -
  // needs it immediately. Drivers (805 rows) and teams (171 rows) are each only eager-fetched here
  // when they're the *initial* facet - a direct load of ?section=driver still paints with real data
  // on first byte - otherwise left undefined and picked up client-side the first time that tab is
  // actually visited (see ArchiveExplorer's useArchiveDrivers/useArchiveTeams). Previously all four
  // facets' data was fetched on every load no matter which one was being looked at.
  const [circuitsRead, driversRead, teamsRead, profile, yearStats] = await Promise.all([
    safeReadTracked(() => getAllArchiveCircuitsData(), []),
    section === "driver" ? safeReadTracked(() => getAllArchiveDriversData(), []) : Promise.resolve(null),
    section === "team" ? safeReadTracked(() => getAllArchiveTeamsData(), []) : Promise.resolve(null),
    safeRead(() => getUserProfile(uid), null),
    safeRead(() => getArchiveYearStatsData(), {} as Awaited<ReturnType<typeof getArchiveYearStatsData>>),
  ]);
  const { data: circuits } = circuitsRead;
  // Real failure, not "genuinely nothing indexed yet" - safeRead alone can't tell those apart
  // (both just come back as []), and only the former should read as an error to retry. A facet
  // that wasn't eager-fetched here (driversRead/teamsRead null) hasn't failed - it hasn't been
  // attempted yet, that's the client query's job.
  const hasLoadError = circuitsRead.failed || driversRead?.failed || teamsRead?.failed;
  const { circuitIds: activeCircuitIds, teamIds: activeTeamIds, currentLeader } = await getActiveIds(circuits);

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
      <h1 className="flex shrink-0 items-baseline gap-3">
        <span className="text-5xl font-bold tracking-tight text-white sm:text-6xl">Archive</span>
        <span className="text-sm font-semibold uppercase tracking-[0.25em] text-neutral-500">
          {ARCHIVE_EARLIEST_YEAR}–{ARCHIVE_LATEST_YEAR}
        </span>
      </h1>
      <p className="mt-1 shrink-0 text-sm text-neutral-500">Results only, sourced from the Ergast/Jolpi historical database.</p>
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        {hasLoadError && <RetryBanner />}
        <ArchiveExplorer
          uid={uid}
          initialSection={section}
          years={getArchiveYears()}
          currentYear={new Date().getFullYear()}
          circuits={circuits}
          initialDrivers={driversRead?.data}
          initialTeams={teamsRead?.data}
          activeCircuitIds={activeCircuitIds}
          activeTeamIds={activeTeamIds}
          yearStats={yearStats}
          currentLeader={currentLeader}
          favoriteTracks={profile?.favoriteTracks ?? []}
          favoriteDrivers={profile?.favoriteDrivers ?? []}
          favoriteTeams={profile?.favoriteTeams ?? []}
        />
      </div>
    </div>
  );
}

/** The circuit's real race-by-race history as an explorer (search/decade filter, dense table,
 * persistent focused panel) instead of a flat stack of link cards - the "entity" column is the
 * real classified winner (driverId is on the result row directly, archive has never needed a
 * code->id resolution step the way live-season data does). */
async function ArchiveCircuitHistory({ circuitId }: { circuitId: string }) {
  const [circuit, races] = await Promise.all([getArchiveCircuitData(circuitId), getArchiveCircuitHistoryData(circuitId)]);
  if (!circuit) notFound();

  const winners = races.map((r) => r.results.find((res) => res.position === 1)).filter((w): w is ArchiveResultEntry => !!w);
  const photoByDriver = await getArchiveDriverPhotosByIds([...new Set(winners.map((w) => w.driverId))]);

  const rows: ExplorerRow[] = races
    .map((race): ExplorerRow => {
      const winner = race.results.find((res) => res.position === 1) ?? null;
      return {
        id: race.id,
        year: race.year,
        round: race.round,
        raceName: race.raceName,
        circuitName: race.circuitName,
        country: race.country,
        entityLabel: winner?.driverName ?? null,
        entityAvatarUrl: winner ? (photoByDriver.get(winner.driverId) ?? null) : undefined,
        entityIsLogo: false,
        grid: winner?.grid ?? null,
        finishText: winner ? finishText(winner.positionText) : "—",
        finishRank: winner ? 1 : null,
        points: winner?.points ?? 0,
      };
    })
    .sort((a, b) => b.year - a.year || b.round - a.round);

  const years = races.map((r) => r.year);
  const winCounts = new Map<string, number>();
  for (const w of winners) winCounts.set(w.driverName, (winCounts.get(w.driverName) ?? 0) + 1);
  const topWinner = [...winCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
      <ArchiveApexScope entityType="circuit" entityId={circuitId} name={circuit.name ?? circuit.circuitId} />
      <ArchiveEntityHeader
        backHref="/archive?section=track"
        backLabel="Archive"
        name={circuit.name ?? circuit.circuitId}
        photoUrl={circuit.imageUrls?.[0] ?? circuit.imageUrl ?? null}
        photoShape="square"
        subtitle={`${Math.min(...years)}–${Math.max(...years)} · ${races.length} race${races.length === 1 ? "" : "s"}`}
        stats={[{ label: "Races", value: races.length }, ...(topWinner ? [{ label: "Most wins", value: `${topWinner[0]} (${topWinner[1]})` }] : [])]}
        favoriteButton={<ArchiveFavoriteToggle type="track" id={circuitId} />}
      />
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <ArchiveExplorerWithFocus rows={rows} entityColumnLabel="Winner" />
      </div>
    </div>
  );
}

/** A driver's whole career as a real explorer, not 400 stacked cards - search/decade/result-type
 * filters, a dense table, a persistent focused panel for the selected race, real computed stats,
 * and a real team-era timeline (contiguous stints, not a fabricated grouping). */
async function ArchiveDriverHistory({ driverId }: { driverId: string }) {
  const [driver, races] = await Promise.all([getArchiveDriverData(driverId), getArchiveDriverHistoryData(driverId)]);
  if (races.length === 0) notFound();

  type Entry = { race: ArchiveRaceDoc; result: ArchiveResultEntry };
  const entries: Entry[] = races
    .map((race): Entry | null => {
      const result = race.results.find((r) => r.driverId === driverId);
      return result ? { race, result } : null;
    })
    .filter((e): e is Entry => e !== null);

  const name = driver?.name ?? entries[0]?.result.driverName ?? driverId;
  const years = races.map((r) => r.year);
  const currentTeams = await getAllCurrentTeams();
  const logoByTeam = new Map(currentTeams.map((t) => [t.name, t.logoUrl]));

  const rows: ExplorerRow[] = entries
    .map(
      ({ race, result }): ExplorerRow => ({
        id: race.id,
        year: race.year,
        round: race.round,
        raceName: race.raceName,
        circuitName: race.circuitName,
        country: race.country,
        entityLabel: result.constructor,
        entityAvatarUrl: logoByTeam.get(result.constructor) ?? null,
        entityIsLogo: true,
        grid: result.grid,
        finishText: finishText(result.positionText),
        finishRank: isClassified(result.status) ? result.position : null,
        points: result.points,
      }),
    )
    .sort((a, b) => b.year - a.year || b.round - a.round);

  const wins = rows.filter((r) => r.finishRank === 1).length;
  const podiums = rows.filter((r) => r.finishRank !== null && r.finishRank <= 3).length;
  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);
  const finishes = rows.filter((r) => r.finishRank !== null).length;
  const retirements = rows.length - finishes;

  const eraSegments = buildEraSegments(entries.map(({ race, result }) => ({ year: race.year, label: result.constructor, raceCount: 1 })));

  const resultFilters: ResultFilter[] = [
    { key: "wins", label: "Wins", test: (r) => r.finishRank === 1 },
    { key: "podiums", label: "Podiums", test: (r) => r.finishRank !== null && r.finishRank <= 3 },
    { key: "points", label: "Points", test: (r) => r.points > 0 },
    { key: "dnf", label: "Retirements", test: (r) => r.finishRank === null },
  ];

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
      <ArchiveApexScope entityType="driver" entityId={driverId} name={name} />
      <ArchiveEntityHeader
        backHref="/archive?section=driver"
        backLabel="Archive"
        name={name}
        photoUrl={driver?.photoUrl ?? null}
        subtitle={`${Math.min(...years)}–${Math.max(...years)} · ${races.length} race${races.length === 1 ? "" : "s"}`}
        stats={[
          { label: "Wins", value: wins },
          { label: "Podiums", value: podiums },
          { label: "Points", value: totalPoints },
          { label: "Finishes", value: finishes },
          { label: "Retirements", value: retirements },
        ]}
        favoriteButton={<ArchiveFavoriteToggle type="driver" id={driverId} />}
      />
      {eraSegments.length > 0 && (
        <div className="mt-4 shrink-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Team eras</p>
          <ArchiveEraTimeline segments={eraSegments} />
        </div>
      )}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <ArchiveExplorerWithFocus rows={rows} entityColumnLabel="Team" resultFilters={resultFilters} />
      </div>
    </div>
  );
}

/** A constructor's whole history as a real explorer - the entity column is this team's own
 * best-placed finisher per race (never the overall race winner if that happened to be a rival),
 * plus a real driver-relationships table (every driver who's carried this team's colours, with
 * their own real race/win counts against THIS team specifically). */
async function ArchiveTeamHistory({ teamId }: { teamId: string }) {
  const [team, races] = await Promise.all([getArchiveTeamData(teamId), getArchiveTeamHistoryData(teamId)]);
  if (!team) notFound();
  const years = races.map((r) => r.year);

  type Entry = { race: ArchiveRaceDoc; result: ArchiveResultEntry };
  const allEntries: Entry[] = races.flatMap((race) => race.results.filter((r) => r.teamId === teamId).map((result) => ({ race, result })));
  const photoByDriver = await getArchiveDriverPhotosByIds([...new Set(allEntries.map((e) => e.result.driverId))]);

  const byRace = new Map<string, Entry[]>();
  for (const e of allEntries) {
    const list = byRace.get(e.race.id) ?? [];
    list.push(e);
    byRace.set(e.race.id, list);
  }

  const rows: ExplorerRow[] = [...byRace.values()]
    .map((raceEntries): ExplorerRow => {
      const race = raceEntries[0].race;
      const best = [...raceEntries].sort((a, b) => (a.result.position ?? 999) - (b.result.position ?? 999))[0];
      const others = raceEntries.length - 1;
      return {
        id: race.id,
        year: race.year,
        round: race.round,
        raceName: race.raceName,
        circuitName: race.circuitName,
        country: race.country,
        entityLabel: others > 0 ? `${best.result.driverName} +${others}` : best.result.driverName,
        entityAvatarUrl: photoByDriver.get(best.result.driverId) ?? null,
        entityIsLogo: false,
        grid: best.result.grid,
        finishText: finishText(best.result.positionText),
        finishRank: isClassified(best.result.status) ? best.result.position : null,
        points: raceEntries.reduce((sum, e) => sum + e.result.points, 0),
      };
    })
    .sort((a, b) => b.year - a.year || b.round - a.round);

  const wins = rows.filter((r) => r.finishRank === 1).length;
  const podiums = rows.filter((r) => r.finishRank !== null && r.finishRank <= 3).length;
  const totalPoints = allEntries.reduce((sum, e) => sum + e.result.points, 0);

  const byDriver = new Map<string, { name: string; races: Set<string>; wins: number }>();
  for (const e of allEntries) {
    const existing = byDriver.get(e.result.driverId) ?? { name: e.result.driverName, races: new Set<string>(), wins: 0 };
    existing.races.add(e.race.id);
    if (e.result.position === 1 && isClassified(e.result.status)) existing.wins += 1;
    byDriver.set(e.result.driverId, existing);
  }
  const relationships: DriverRelationship[] = [...byDriver.entries()]
    .map(([id, v]) => ({ driverId: id, name: v.name, photoUrl: photoByDriver.get(id) ?? null, races: v.races.size, wins: v.wins }))
    .sort((a, b) => b.races - a.races);

  const resultFilters: ResultFilter[] = [
    { key: "wins", label: "Wins", test: (r) => r.finishRank === 1 },
    { key: "podiums", label: "Podiums", test: (r) => r.finishRank !== null && r.finishRank <= 3 },
  ];

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
      <ArchiveApexScope entityType="team" entityId={teamId} name={team.name} />
      <ArchiveEntityHeader
        backHref="/archive?section=team"
        backLabel="Archive"
        name={team.name}
        photoUrl={null}
        photoShape="square"
        subtitle={`${Math.min(...years)}–${Math.max(...years)} · ${races.length} race${races.length === 1 ? "" : "s"}`}
        stats={[
          { label: "Wins", value: wins },
          { label: "Podiums", value: podiums },
          { label: "Points", value: totalPoints },
          { label: "Drivers", value: relationships.length },
        ]}
        favoriteButton={<ArchiveFavoriteToggle type="team" id={teamId} />}
      />
      {relationships.length > 0 && (
        <div className="mt-4 shrink-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Drivers</p>
          <ArchiveDriverRelationships drivers={relationships} maxHeightPx={160} />
        </div>
      )}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <ArchiveExplorerWithFocus rows={rows} entityColumnLabel="Driver" resultFilters={resultFilters} />
      </div>
    </div>
  );
}

export const metadata: Metadata = {
  title: "Archive",
  description: `Every F1 season from ${ARCHIVE_EARLIEST_YEAR} to ${ARCHIVE_LATEST_YEAR} — results, qualifying, and pit stops.`,
};

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    round?: string;
    section?: string;
    circuit?: string;
    driver?: string;
    team?: string;
  }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <SignInGate label="the historical archive" />
      </div>
    );
  }

  const { year: yearParam, round: roundParam, section, circuit, driver, team } = await searchParams;
  const year = yearParam ? Number(yearParam) : null;
  const round = roundParam ? Number(roundParam) : null;

  // ?year=&round= is a specific-race lookup by round number - resolve it to that race's real
  // query-based route (raceHref) rather than rendering it here.
  if (year && round) {
    const race = await getArchiveRaceData(year, round);
    if (!race) notFound();
    redirect(raceHref(year, round, race.raceName));
  }
  // Bare ?year= is the canonical year route (archive is a query-parameterized browsing page, not a
  // path hierarchy) - rendered inline, not redirected.
  if (year) return <ArchiveYearView year={year} uid={session.uid} />;
  if (circuit) return <ArchiveCircuitHistory circuitId={circuit} />;
  if (driver) return <ArchiveDriverHistory driverId={driver} />;
  if (team) return <ArchiveTeamHistory teamId={team} />;
  const facet: Facet = section === "track" || section === "driver" || section === "team" ? section : "year";
  return <ArchiveIndex section={facet} uid={session.uid} />;
}
