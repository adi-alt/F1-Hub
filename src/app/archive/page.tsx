import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { ArchiveExplorer } from "./components/ArchiveExplorer";
import { ArchiveYearView } from "./components/ArchiveYearView";
import { RetryBanner } from "./components/RetryBanner";
import { ArchiveEntityFigures, ArchiveEntityHeader } from "./components/ArchiveEntityHeader";
import { ArchiveCircuitSkeleton, ArchiveEntityBodySkeleton, ArchiveEntityHeadSkeleton } from "./components/ArchiveEntitySkeletons";
import { ArchiveSignatureCircuit, signatureCircuit } from "./components/ArchiveSignatureCircuit";
import { ArchiveSection } from "./components/ArchiveSection";
import { ArchiveFavoriteToggle } from "./components/ArchiveFavoriteToggle";
import { ArchiveApexScope } from "./components/ArchiveApexScope";
import { ArchiveExplorerWithFocus } from "./components/ArchiveExplorerWithFocus";
import { ArchiveEraTimeline } from "./components/ArchiveEraTimeline";
import { buildEraSegments } from "./components/eraSegments";
import { ArchiveDriverRelationships, type DriverRelationship } from "./components/ArchiveDriverRelationships";
import type { ExplorerRow } from "./components/ArchiveRaceExplorer";
import {
  ARCHIVE_EARLIEST_YEAR,
  archiveLatestYear,
  getActiveIds,
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
import type { ArchiveRaceDoc, ArchiveResultEntry } from "@/lib/supabase/archive";
import { getArchiveDriverPhotosByIds, getArchiveYearStats } from "@/lib/supabase/archive";
import { getCircuitDrawing, safeCircuitDrawingsById } from "@/lib/supabase/circuitLayouts";
import { ArchiveSeasonStory, type SeasonPoint } from "./components/ArchiveSeasonStory";
import { constructorChampionOverride, isVerifiedChampionYear } from "@/lib/eras";
import { teamColor } from "@/lib/teamColors";
import { archiveCircuitHref, archiveDriverHref, archiveSeasonHref, archiveTeamHref } from "@/lib/routes";
import { getAllCurrentTeams } from "@/lib/supabase/media";
import { getUserProfile } from "@/lib/supabase/users";
import { safeRead, safeReadTracked } from "@/lib/safeRead";
import { raceHref } from "@/lib/routes";
import { CircuitThumb } from "@/components/circuit/CircuitThumb";
import { getSession } from "@/lib/session/getSession";
import { getCurrentSeason } from "@/lib/currentSeason";
import { pageMetadata } from "@/lib/seo";
import { isClassified } from "@/lib/archiveResult";
import { getArchiveCircuit, getArchiveDriver, getArchiveTeam } from "@/lib/supabase/archive";


function finishText(positionText: string): string {
  return /^\d+$/.test(positionText) ? `P${positionText}` : positionText;
}

type Facet = "year" | "track" | "driver" | "team";

// A Firestore outage (quota, transient error, anything) degrades this page to empty
// tabs/favorites instead of crashing it outright — the same "temporarily nothing here" empty
// states these components already show when a pipeline pass genuinely hasn't reached this data
// yet double as the degraded view; nothing new to build for that. getActiveIds itself now lives in
// archive.service.ts (see its own docstring there) so the ask-apex route's By Track/By Team
// grounding builders can reuse the exact same "active this season" reconciliation this page uses.
async function ArchiveIndex({ section, uid }: { section: Facet; uid: string }) {
  // Circuits and year-stats are unconditionally eager: circuits because getActiveIds' active/
  // historical reconciliation needs the full list regardless of which tab is open (and its own
  // fetch is far cheaper than drivers/teams anyway), year-stats because "By year" - the default -
  // needs it immediately. Drivers (805 rows) and teams (171 rows) are each only eager-fetched here
  // when they're the *initial* facet - a direct load of ?section=driver still paints with real data
  // on first byte - otherwise left undefined and picked up client-side the first time that tab is
  // actually visited (see ArchiveExplorer's useArchiveDrivers/useArchiveTeams). Previously all four
  // facets' data was fetched on every load no matter which one was being looked at.
  const [circuitsRead, driversRead, teamsRead, profile, yearStats, drawings] = await Promise.all([
    safeReadTracked(() => getAllArchiveCircuitsData(), []),
    section === "driver" ? safeReadTracked(() => getAllArchiveDriversData(), []) : Promise.resolve(null),
    section === "team" ? safeReadTracked(() => getAllArchiveTeamsData(), []) : Promise.resolve(null),
    safeRead(() => getUserProfile(uid), null),
    safeRead(() => getArchiveYearStatsData(), {} as Awaited<ReturnType<typeof getArchiveYearStatsData>>),
    safeCircuitDrawingsById(),
  ]);
  // Each circuit with its own line drawing, so the By track grid draws them as the circuits pages do.
  const circuits = circuitsRead.data.map((c) => ({ ...c, drawing: drawings[c.circuitId] ?? null }));
  // Real failure, not "genuinely nothing indexed yet" - safeRead alone can't tell those apart
  // (both just come back as []), and only the former should read as an error to retry. A facet
  // that wasn't eager-fetched here (driversRead/teamsRead null) hasn't failed - it hasn't been
  // attempted yet, that's the client query's job.
  const hasLoadError = circuitsRead.failed || driversRead?.failed || teamsRead?.failed;
  const { circuitIds: activeCircuitIds, teamIds: activeTeamIds, currentLeader } = await getActiveIds(circuits);
  // The live season's card: from the calendar, not the clock (R-22).
  const currentSeason = await getCurrentSeason();

  return (
    <div data-surface="frosted" className="page-wide py-8">
      <header className="mb-8">
        <p className="text-body-sm text-secondary">
          {ARCHIVE_EARLIEST_YEAR}–{archiveLatestYear(currentSeason)}
        </p>
        <h1 className="mt-1 text-display-lg font-bold text-primary sm:text-display-xl">Archive</h1>
        <p className="mt-3 max-w-3xl text-title-md text-primary">
          Every Formula 1 season since {ARCHIVE_EARLIEST_YEAR}: {Object.keys(yearStats).length} seasons and {Object.values(yearStats).reduce((sum, y) => sum + y.raceCount, 0).toLocaleString("en-GB")} Grands Prix, with every
          driver, team and circuit.
        </p>
        <p className="mt-2 text-caption text-tertiary">Official classifications, from the Ergast/Jolpica historical database.</p>
      </header>
      <div className="flex flex-col">
        {hasLoadError && <RetryBanner />}
        <ArchiveExplorer
          uid={uid}
          initialSection={section}
          years={getArchiveYears(archiveLatestYear(currentSeason))}
          currentYear={currentSeason}
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
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const n = (k: number) => WORDS[k] ?? String(k);

/** Season-by-season totals for a driver's or a team's races: points are the Grand Prix plus that weekend's sprint, the
 * team is the one raced most that year, and a title is marked only where the archive's sum is the real rule (1991 on). */
function seasonsOf(
  entries: { race: ArchiveRaceDoc; result: ArchiveResultEntry }[],
  sprintPoints: (race: ArchiveRaceDoc) => number,
  isChampion: (year: number, team: string) => boolean,
): SeasonPoint[] {
  const byYear = new Map<number, { points: number; wins: number; podiums: number; races: Set<string>; teams: Map<string, number> }>();
  const sprintCounted = new Set<string>();
  for (const { race, result } of entries) {
    const y = byYear.get(race.year) ?? { points: 0, wins: 0, podiums: 0, races: new Set<string>(), teams: new Map<string, number>() };
    y.points += result.points;
    if (!sprintCounted.has(race.id)) {
      y.points += sprintPoints(race);
      sprintCounted.add(race.id);
    }
    if (isClassified(result.status) && result.position === 1) y.wins += 1;
    if (isClassified(result.status) && result.position <= 3) y.podiums += 1;
    y.races.add(race.id);
    y.teams.set(result.constructor, (y.teams.get(result.constructor) ?? 0) + 1);
    byYear.set(race.year, y);
  }
  return [...byYear.entries()].map(([year, y]) => {
    const team = [...y.teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    return { year, points: Math.round(y.points * 10) / 10, wins: y.wins, podiums: y.podiums, races: y.races.size, team, champion: isChampion(year, team) };
  });
}

async function ArchiveCircuitHistory({ circuitId }: { circuitId: string }) {
  const [circuit, races] = await Promise.all([getArchiveCircuitData(circuitId), getArchiveCircuitHistoryData(circuitId)]);
  if (!circuit) notFound();

  const winners = races.map((r) => r.results.find((res) => res.position === 1)).filter((w): w is ArchiveResultEntry => !!w);
  // The layout as last raced here, from the track library: the circuits pages' own drawing.
  const lastRace = races.reduce<ArchiveRaceDoc | null>((a, b) => (!a || b.year > a.year || (b.year === a.year && b.round > a.round) ? b : a), null);
  const [photoByDriver, drawing] = await Promise.all([
    getArchiveDriverPhotosByIds([...new Set(winners.map((w) => w.driverId))]),
    getCircuitDrawing({ circuitId, circuitName: circuit.name ?? null, year: lastRace?.year ?? 0, raceName: lastRace?.raceName ?? "" }),
  ]);

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
        entityHref: winner ? archiveDriverHref(winner.driverId) : null,
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

  const first = Math.min(...years);
  const topWinners = [...winCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const winnerIdByName = new Map(winners.map((w) => [w.driverName, w.driverId]));
  const answer = `${races.length} Grands Prix since ${first}${topWinner ? `; ${topWinner[0]} has won here most, ${n(topWinner[1])} time${topWinner[1] === 1 ? "" : "s"}` : ""}.`;

  return (
    <div data-surface="frosted" className="page-wide py-8">
      <ArchiveApexScope entityType="circuit" entityId={circuitId} name={circuit.name ?? circuit.circuitId} />
      <ArchiveEntityHeader
        backHref="/archive?section=track"
        backLabel="Archive"
        kind="Circuit"
        name={circuit.name ?? circuit.circuitId}
        subtitle={[circuit.locality, circuit.country].filter(Boolean).join(", ") || `${first}–${Math.max(...years)}`}
        answer={answer}
        stats={[
          { label: "Grands Prix", value: races.length },
          { label: "First held", value: first },
          { label: "Last held", value: Math.max(...years) },
          ...(topWinner ? [{ label: "Most wins", value: topWinner[1], detail: topWinner[0] }] : []),
        ]}
        favoriteButton={<ArchiveFavoriteToggle type="track" id={circuitId} />}
      />
      <div className="space-y-10">
        <ArchiveSection id="circuit" title="The circuit and its winners">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12">
            {drawing || circuit.trackMap ? (
              <CircuitThumb drawing={drawing} map={circuit.trackMap} name={circuit.name ?? circuit.circuitId} turns className="aspect-[3/2] w-full" />
            ) : (
              <p className="text-body-sm text-secondary">No track map on record.</p>
            )}
            <ol className="divide-y divide-subtle">
              {topWinners.map(([name, wins], i) => {
                const id = winnerIdByName.get(name);
                return (
                  <li key={name} className="flex items-center justify-between gap-3 py-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="w-5 text-caption tabular text-tertiary">{i + 1}</span>
                      {id ? (
                        <a href={archiveDriverHref(id)} className="truncate text-body-sm font-medium text-primary underline-offset-4 hover:underline">
                          {name}
                        </a>
                      ) : (
                        <span className="truncate text-body-sm text-primary">{name}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-body-sm tabular text-secondary">
                      {wins} win{wins === 1 ? "" : "s"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </ArchiveSection>
        <ArchiveSection id="races" title="Every Grand Prix here" note="Select a race to open it" bare>
          <ArchiveExplorerWithFocus rows={rows} entityColumnLabel="Winner" />
        </ArchiveSection>
      </div>
    </div>
  );
}

/** Renders the real error inline instead of letting it fall through to the app's generic
 * "Something went wrong" boundary - but ONLY for a signed-in admin (this app's own owner), and
 * never for anything that isn't a genuine unexpected error. `unstable_rethrow` is called first and
 * unconditionally: notFound()/redirect() are themselves implemented as thrown errors carrying a
 * special digest Next's own framework recognizes, and swallowing those into a diagnostic panel
 * (even an admin-only one) would break real 404s/redirects on these pages, not just suppress a
 * genuine bug. A non-admin (or a session lookup failure) always rethrows too - this exists to let
 * the one person who can act on it read the real message directly off the page instead of us
 * blindly guessing at production-only failures with no server-log access. Temporary - remove once
 * the underlying archive.ts bug is confirmed fixed and stable in production. */
async function renderDiagnosticIfAdmin(err: unknown) {
  unstable_rethrow(err);
  const session = await getSession().catch(() => null);
  // session.role alone is cached from whenever this account's profile was created (see
  // createUserProfile's own bootstrap-admin comment) - checking the same ADMIN_EMAILS allowlist
  // directly against the session's own email is the more reliable of the two, independent of
  // whether that role field ever got backfilled for an existing account.
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = session?.role === "admin" || (!!session?.email && adminEmails.includes(session.email.toLowerCase()));
  if (!isAdmin) throw err;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const digest = (err as { digest?: string } | null)?.digest;

  return (
    <div className="page-narrow py-10">
      <div className="rounded-2xl border border-[var(--f1-red)]/40 bg-[var(--f1-carbon)] p-6">
        <p className="text-xs font-semibold text-brand-text">Admin-only diagnostic — this page threw</p>
        <p className="mt-3 whitespace-pre-wrap text-sm text-primary">{message}</p>
        {digest && <p className="mt-2 text-xs text-tertiary">digest: {digest}</p>}
        {stack && <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs text-tertiary">{stack}</pre>}
      </div>
    </div>
  );
}

/** A driver's whole career as a real explorer, not 400 stacked cards - search/decade/result-type
 * filters, a dense table, a persistent focused panel for the selected race, real computed stats,
 * and a real team-era timeline (contiguous stints, not a fabricated grouping). */
//
// Streamed in two parts, each behind its own keyed Suspense: the name and photo (one cached row) the moment the page is
// opened, then the career (the figures, the curve, the table) as soon as it's read, with skeletons standing in until
// then. The keys make each driver a new boundary, so a click from the table shows the skeleton at once instead of
// holding the previous page until everything is ready.
function ArchiveDriverHistory({ driverId }: { driverId: string }) {
  return (
    <div data-surface="frosted" className="page-wide py-8">
      <Suspense key={`head:${driverId}`} fallback={<ArchiveEntityHeadSkeleton />}>
        <ArchiveDriverHead driverId={driverId} />
      </Suspense>
      <Suspense key={`body:${driverId}`} fallback={<ArchiveEntityBodySkeleton />}>
        <ArchiveDriverBody driverId={driverId} />
      </Suspense>
    </div>
  );
}

async function ArchiveDriverHead({ driverId }: { driverId: string }) {
  const driver = await getArchiveDriverData(driverId).catch(() => null);
  const name = driver?.name ?? driverId;
  const teams = driver?.constructors ?? [];
  return (
    <>
      <ArchiveApexScope entityType="driver" entityId={driverId} name={name} />
      <ArchiveEntityHeader
        backHref="/archive?section=driver"
        backLabel="Archive"
        kind="Driver"
        name={name}
        photoUrl={driver?.photoUrl ?? null}
        subtitle={[driver ? (driver.firstYear === driver.lastYear ? `${driver.firstYear}` : `${driver.firstYear}–${driver.lastYear}`) : null, teams.join(", ") || null].filter(Boolean).join(" · ")}
        favoriteButton={<ArchiveFavoriteToggle type="driver" id={driverId} />}
      />
    </>
  );
}

async function ArchiveDriverBody({ driverId }: { driverId: string }) {
  try {
    return await ArchiveDriverHistoryInner(driverId);
  } catch (err) {
    return renderDiagnosticIfAdmin(err);
  }
}

async function ArchiveDriverHistoryInner(driverId: string) {
  // currentTeams doesn't depend on driver/races at all (it's only used below to look up each
  // result's own logo) - folded into the same Promise.all instead of a separate `await` after,
  // which was pure sequential latency on top of the driver/race fetch for no reason. Small on its
  // own (getAllCurrentTeams is cached), but real time on a route that didn't have much margin to
  // spare for a prolific driver even before this.
  const [driver, races, currentTeams, yearStats] = await Promise.all([getArchiveDriverData(driverId), getArchiveDriverHistoryData(driverId), getAllCurrentTeams(), getArchiveYearStats()]);
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
        entityHref: result.teamId ? archiveTeamHref(result.teamId) : null,
        entityAvatarUrl: logoByTeam.get(result.constructor) ?? null,
        entityIsLogo: true,
        grid: result.grid,
        finishText: finishText(result.positionText),
        finishRank: isClassified(result.status) ? result.position : null,
        // The weekend's points: the Grand Prix plus that weekend's sprint, as the championship counts them.
        points: result.points + (race.sprintResults ?? []).filter((s) => s.driverId === driverId).reduce((sum, s) => sum + s.points, 0),
      }),
    )
    .sort((a, b) => b.year - a.year || b.round - a.round);

  const wins = rows.filter((r) => r.finishRank === 1).length;
  const podiums = rows.filter((r) => r.finishRank !== null && r.finishRank <= 3).length;
  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);
  const finishes = rows.filter((r) => r.finishRank !== null).length;
  const retirements = rows.length - finishes;

  const eraSegments = buildEraSegments(entries.map(({ race, result }) => ({ year: race.year, label: result.constructor, raceCount: 1 })));

  const seasons = seasonsOf(
    entries,
    (race) => (race.sprintResults ?? []).filter((x) => x.driverId === driverId).reduce((sum, x) => sum + x.points, 0),
    (year) => isVerifiedChampionYear(year) && yearStats[year]?.driverLeader?.driverId === driverId,
  );
  const titles = seasons.filter((x) => x.champion).length;
  const lastTeam = [...entries].sort((a, b) => b.race.year - a.race.year || b.race.round - a.race.round)[0]?.result.constructor ?? null;
  const answer =
    (titles > 0 ? `${titles === 1 ? "World champion" : `${n(titles)[0].toUpperCase()}${n(titles).slice(1)}-time world champion`}, ` : "") +
    `${wins} win${wins === 1 ? "" : "s"} and ${podiums} podium${podiums === 1 ? "" : "s"} from ${races.length} race${races.length === 1 ? "" : "s"}, ${Math.min(...years)}–${Math.max(...years)}.`;

  const signature = signatureCircuit(entries, "wins");

  return (
    <>
      <ArchiveEntityFigures
        answer={answer}
        stats={[
          ...(titles > 0 ? [{ label: "Titles", value: titles }] : []),
          { label: "Wins", value: wins },
          { label: "Podiums", value: podiums },
          { label: "Points", value: Math.round(totalPoints * 10) / 10 },
          { label: "Races", value: races.length },
          { label: "Finishes", value: finishes, detail: `${retirements} retirement${retirements === 1 ? "" : "s"}` },
        ]}
      />
      <div className="mt-10 space-y-10">
        <SeasonsWithCircuit
          seasons={<ArchiveSeasonStory seasons={seasons} subject={name} />}
          note="Points each year, in the team's colours"
          circuitTitle={signature && signature.wins > 0 ? "Best circuit" : "Most raced circuit"}
          circuit={signature ? <ArchiveSignatureCircuit circuit={signature} lapColor={lastTeam ? teamColor(lastTeam) : null} /> : null}
        />
        {eraSegments.length > 1 && (
          <ArchiveSection id="teams" title="Teams through time">
            <ArchiveEraTimeline segments={eraSegments} />
          </ArchiveSection>
        )}
        <ArchiveSection id="races" title="Every race" note="Select a race or a team to open it" bare>
          <ArchiveExplorerWithFocus rows={rows} entityColumnLabel="Team" resultFilterKeys={["wins", "podiums", "points", "dnf"]} />
        </ArchiveSection>
      </div>
    </>
  );
}

/** A constructor's whole history as a real explorer - the entity column is this team's own
 * best-placed finisher per race (never the overall race winner if that happened to be a rival),
 * plus a real driver-relationships table (every driver who's carried this team's colours, with
 * their own real race/win counts against THIS team specifically). */
// Streamed as the driver's page is (see ArchiveDriverHistory).
function ArchiveTeamHistory({ teamId }: { teamId: string }) {
  return (
    <div data-surface="frosted" className="page-wide py-8">
      <Suspense key={`head:${teamId}`} fallback={<ArchiveEntityHeadSkeleton photo={false} />}>
        <ArchiveTeamHead teamId={teamId} />
      </Suspense>
      <Suspense key={`body:${teamId}`} fallback={<ArchiveEntityBodySkeleton />}>
        <ArchiveTeamBody teamId={teamId} />
      </Suspense>
    </div>
  );
}

async function ArchiveTeamHead({ teamId }: { teamId: string }) {
  const team = await getArchiveTeamData(teamId);
  if (!team) notFound();
  return (
    <>
      <ArchiveApexScope entityType="team" entityId={teamId} name={team.name} />
      <ArchiveEntityHeader
        backHref="/archive?section=team"
        backLabel="Archive"
        kind="Constructor"
        name={team.name}
        photoUrl={null}
        photoShape="square"
        accent={teamColor(team.name)}
        subtitle={`${team.firstYear === team.lastYear ? team.firstYear : `${team.firstYear}–${team.lastYear}`} · ${team.raceCount} race${team.raceCount === 1 ? "" : "s"}`}
        favoriteButton={<ArchiveFavoriteToggle type="team" id={teamId} />}
      />
    </>
  );
}

async function ArchiveTeamBody({ teamId }: { teamId: string }) {
  try {
    return await ArchiveTeamHistoryInner(teamId);
  } catch (err) {
    return renderDiagnosticIfAdmin(err);
  }
}

async function ArchiveTeamHistoryInner(teamId: string) {
  const [team, races, yearStats] = await Promise.all([getArchiveTeamData(teamId), getArchiveTeamHistoryData(teamId), getArchiveYearStats()]);
  if (!team) notFound();

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
        entityHref: archiveDriverHref(best.result.driverId),
        entityAvatarUrl: photoByDriver.get(best.result.driverId) ?? null,
        entityIsLogo: false,
        grid: best.result.grid,
        finishText: finishText(best.result.positionText),
        finishRank: isClassified(best.result.status) ? best.result.position : null,
        // Both cars' Grand Prix points plus the team's sprint points that weekend.
        points: raceEntries.reduce((sum, e) => sum + e.result.points, 0) + (race.sprintResults ?? []).filter((s) => s.teamId === teamId).reduce((sum, s) => sum + s.points, 0),
      };
    })
    .sort((a, b) => b.year - a.year || b.round - a.round);

  const wins = rows.filter((r) => r.finishRank === 1).length;
  const podiums = rows.filter((r) => r.finishRank !== null && r.finishRank <= 3).length;
  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);

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

  const seasons = seasonsOf(
    allEntries,
    (race) => (race.sprintResults ?? []).filter((x) => x.teamId === teamId).reduce((sum, x) => sum + x.points, 0),
    (year, constructor) => isVerifiedChampionYear(year) && (constructorChampionOverride(year) ?? yearStats[year]?.teamLeader?.name) === constructor,
  );
  const titles = seasons.filter((x) => x.champion).length;
  const answer =
    (titles > 0 ? `${titles === 1 ? "Constructors' champion" : `${n(titles)[0].toUpperCase()}${n(titles).slice(1)}-time constructors' champion`} since 1991, ` : "") +
    `${wins} win${wins === 1 ? "" : "s"} from ${byRace.size} race${byRace.size === 1 ? "" : "s"}, with ${relationships.length} driver${relationships.length === 1 ? "" : "s"}.`;

  const signature = signatureCircuit(allEntries, "starts");

  return (
    <>
      <ArchiveEntityFigures
        answer={answer}
        stats={[
          ...(titles > 0 ? [{ label: "Titles since 1991", value: titles }] : []),
          { label: "Wins", value: wins },
          { label: "Podiums", value: podiums },
          { label: "Points", value: Math.round(totalPoints * 10) / 10 },
          { label: "Drivers", value: relationships.length },
        ]}
      />
      <div className="mt-10 space-y-10">
        <SeasonsWithCircuit
          seasons={<ArchiveSeasonStory seasons={seasons} subject={team.name} />}
          note="Points each year, both cars and the sprint"
          circuitTitle="Most raced circuit"
          circuit={signature ? <ArchiveSignatureCircuit circuit={signature} lapColor={teamColor(team.name)} /> : null}
        />
        {relationships.length > 0 && (
          <ArchiveSection id="drivers" title="Its drivers" note="Most races first" bare>
            <ArchiveDriverRelationships drivers={relationships} />
          </ArchiveSection>
        )}
        <ArchiveSection id="races" title="Every race" note="The team's best-placed car in each race" bare>
          <ArchiveExplorerWithFocus rows={rows} entityColumnLabel="Driver" resultFilterKeys={["wins", "podiums"]} />
        </ArchiveSection>
      </div>
    </>
  );
}

/** The career curve beside the signature circuit's drawing (stacked on a phone). The circuit reads its layout on its
 * own, so it streams in behind its own skeleton rather than holding the curve back. */
function SeasonsWithCircuit({ seasons, note, circuit, circuitTitle }: { seasons: React.ReactNode; note: string; circuit: React.ReactNode; circuitTitle: string }) {
  return (
    <div className={`grid gap-6 ${circuit ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
      <ArchiveSection id="seasons" title="Season by season" note={note}>
        {seasons}
      </ArchiveSection>
      {circuit && (
        <ArchiveSection id="circuit" title={circuitTitle} bare>
          <Suspense fallback={<ArchiveCircuitSkeleton />}>{circuit}</Suspense>
        </ArchiveSection>
      )}
    </div>
  );
}

// Headroom for a cold read of a prolific team's history (getArchiveEntityRaces) plus the render on a serverless
// function, whose platform default ceiling is short.
export const maxDuration = 60;

/** The share card follows the view: a season, a driver's career, a team's history or a circuit's races. Names come
 * from the archive's own cached lookups; anything unknown (or a failed read) falls back to the archive's card. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ year?: string; circuit?: string; driver?: string; team?: string }> }): Promise<Metadata> {
  const { year, circuit, driver, team } = await searchParams;
  try {
    if (driver) {
      const d = await getArchiveDriver(driver);
      if (d) return pageMetadata({ title: `${d.name}: career`, description: `${d.name}'s Formula 1 career, season by season: results, wins, podiums and titles.`, path: archiveDriverHref(driver) });
    }
    if (team) {
      const t = await getArchiveTeam(team);
      if (t) return pageMetadata({ title: `${t.name}: history`, description: `${t.name} in Formula 1, ${t.firstYear}–${t.lastYear}: every season, its drivers and its results.`, path: archiveTeamHref(team) });
    }
    if (circuit) {
      const c = await getArchiveCircuit(circuit);
      if (c?.name) return pageMetadata({ title: `${c.name}: every race`, description: `Every Formula 1 race at ${c.name}: winners, records and how the track changed.`, path: archiveCircuitHref(circuit) });
    }
    if (year && /^\d{4}$/.test(year)) {
      return pageMetadata({ title: `${year} season`, description: `The ${year} Formula 1 season, race by race: results, qualifying and how the championship was won.`, path: archiveSeasonHref(Number(year)) });
    }
  } catch (err) {
    console.error("archive generateMetadata: lookup failed:", err);
  }
  return pageMetadata({
    title: "Archive",
    // No end year: the archive's newest season follows the calendar (R-22).
    description: `Every Formula 1 season since ${ARCHIVE_EARLIEST_YEAR}: results, qualifying, pit stops and the championship, round by round.`,
    path: "/archive",
  });
}

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
      <div className="page-wide py-10">
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
