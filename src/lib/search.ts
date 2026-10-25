// Site search for the command palette (audit R-55, F-14): actions, drivers, teams, circuits, races, seasons, the
// communities the viewer can see, the people in their communities, and the site's sections. Query understanding and
// ranking are pure (searchQuery.ts, searchActions.ts); this gathers the candidates from cached reads, so a keystroke
// costs the communities/people queries and nothing else.
import { parseAvatar } from "@/lib/avatar";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findArchiveCircuitByLocation, getAllArchiveCircuits, getAllArchiveDrivers, getAllArchiveTeams, getArchiveEntityRaces, getArchiveSeason, type ArchiveCircuit, type ArchiveRaceDoc } from "@/lib/supabase/archive";
import { getRaceListByYear } from "@/lib/supabase/races";
import { getAllCurrentDrivers, getAllCurrentTeams } from "@/lib/supabase/media";
import { getUserProfile } from "@/lib/supabase/users";
import { getCurrentSeason } from "@/lib/currentSeason";
import { ARCHIVE_EARLIEST_YEAR } from "@/lib/archiveYears";
import { computeStandings } from "@/lib/standings";
import { teamColor } from "@/lib/teamColors";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";
import { archiveCircuitHref, archiveDriverHref, archiveSeasonHref, archiveTeamHref, groupHref, profileHref, raceHref, seasonHref } from "@/lib/routes";
import { sectionHref } from "@/lib/sectionRoutes";
import { normalise, parseQuery, rankMatches, type SearchResult } from "@/lib/searchQuery";
import { matchActions, type ActionContext } from "@/lib/searchActions";
import type { RaceDoc } from "@/lib/types/race";
import circuitShapesData from "./circuitShapes.json";

export type { SearchKind, SearchResult } from "@/lib/searchQuery";

export const MAX_QUERY_LENGTH = 60;
const REPORT_PROBLEM_URL = "https://github.com/adi-alt/F1-Hub/issues/new";

const SECTIONS: SearchResult[] = [
  { kind: "section", label: "Season", detail: "Standings, races and analysis", href: sectionHref("season") },
  { kind: "section", label: "Circuits", detail: "Every track on the calendar", href: sectionHref("circuits") },
  { kind: "section", label: "Archive", detail: "Every race since 1950", href: sectionHref("archive") },
  { kind: "section", label: "Communities", detail: "Feeds, predictions and leagues", href: sectionHref("communities") },
  { kind: "section", label: "Profile", detail: "Your account and favourites", href: sectionHref("profile") },
  { kind: "section", label: "Favourites", detail: "Settings · drivers, teams and circuits you follow", href: profileHref("personalisation") },
  { kind: "section", label: "Notifications", detail: "Settings · race reminder emails", href: profileHref("notifications") },
  { kind: "section", label: "Predictions", detail: "Your season scorecard", href: profileHref("predictions") },
  { kind: "section", label: "Account", detail: "Settings · download your data, delete your account", href: "/profile/account" },
];

const SHAPES = (circuitShapesData as { shapes: Record<string, { path: string; viewBox?: string }> }).shapes;

/** A circuit's outline from the track library, by its host city ("Spa-Francorchamps") or its own name. */
export function circuitShape(...names: (string | null | undefined)[]): SearchResult["shape"] {
  for (const name of names) {
    if (!name) continue;
    const key = name.trim().toLowerCase();
    const hit = SHAPES[key.replace(/\s+/g, "-")] ?? SHAPES[key];
    if (hit) return { path: hit.path, viewBox: hit.viewBox ?? "0 0 1000 1000" };
  }
  return null;
}

const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null);
const compareHref = (season: number) => (a: string, b: string) => `${sectionHref("season", { year: season, compare: a && b ? `${a}-${b}` : "open" })}#analysis`;

export function seasonResults(query: string, currentSeason: number): SearchResult[] {
  if (!/^\d{4}$/.test(query.trim())) return [];
  const year = Number(query.trim());
  if (year < ARCHIVE_EARLIEST_YEAR || year > currentSeason) return [];
  return [{ kind: "season", label: `${year} season`, href: year === currentSeason ? seasonHref(year) : archiveSeasonHref(year) }];
}

/** A race of this season as a palette row: its status, the winner once it's run, its date. */
export function currentRaceResult(r: RaceDoc): SearchResult {
  const winner = r.results?.find((x) => x.finishPosition === 1);
  const done = r.status === "completed";
  return {
    kind: "race",
    label: `${r.year} ${r.name}`,
    detail: done && winner ? `Won by ${winner.driverName}` : `Round ${r.round} · ${r.circuit}`,
    meta: done ? "Finished" : (shortDate(r.raceDate) ?? "Upcoming"),
    href: raceHref(r.year, r.round, r.name),
    shape: circuitShape(r.circuit),
  };
}

type Index = Awaited<ReturnType<typeof loadIndex>>;

/** Everything the palette searches that isn't per-viewer: cached reads, so this is cheap on every keystroke. */
async function loadIndex() {
  const season = await getCurrentSeason();
  const [drivers, teams, circuits, races, currentDrivers, currentTeams] = await Promise.all([
    getAllArchiveDrivers().catch(() => []),
    getAllArchiveTeams().catch(() => []),
    getAllArchiveCircuits().catch(() => [] as ArchiveCircuit[]),
    getRaceListByYear(season).catch(() => [] as RaceDoc[]),
    getAllCurrentDrivers().catch(() => []),
    getAllCurrentTeams().catch(() => []),
  ]);
  const standings = computeStandings(races);
  const driverRank = new Map(standings.drivers.map((d, i) => [d.driver, { rank: i + 1, points: d.points, team: d.team }]));
  const teamRank = new Map(standings.constructors.map((c, i) => [archiveSlugForCurrentTeam(c.team), { rank: i + 1, points: c.points, name: c.team }]));
  const currentByCode = new Map(currentDrivers.map((d) => [d.code, d]));
  const currentTeamBySlug = new Map(currentTeams.map((t) => [archiveSlugForCurrentTeam(t.name), t]));
  const nextRace = races.find((r) => r.status !== "completed") ?? null;
  // Each archive circuit's race this season, for "next race there".
  const raceByCircuit = new Map<string, RaceDoc>();
  for (const r of races) {
    const c = findArchiveCircuitByLocation(circuits, r.circuit, r.country ?? null);
    if (c) raceByCircuit.set(c.circuitId, r);
  }
  return { season, drivers, teams, circuits, races, driverRank, teamRank, currentByCode, currentTeamBySlug, nextRace, raceByCircuit };
}

function driverResult(ix: Index, d: Index["drivers"][number]): SearchResult {
  const current = d.code && d.lastYear >= ix.season - 1 ? ix.currentByCode.get(d.code) : undefined;
  const standing = d.code ? ix.driverRank.get(d.code) : undefined;
  const team = standing?.team ?? current?.team;
  // A past driver's colour is their last team's, for the initials fallback when there's no headshot.
  const lastTeam = team ?? d.constructors?.at(-1);
  return {
    kind: "driver",
    label: d.name,
    detail: team ? `${d.code ? `${d.code} · ` : ""}${team}` : `${d.firstYear}–${d.lastYear}`,
    meta: standing ? `P${standing.rank} · ${standing.points} pts` : undefined,
    image: current?.headshotUrl ?? d.photoUrl ?? null,
    color: lastTeam ? teamColor(lastTeam) : null,
    href: archiveDriverHref(d.driverId),
  };
}

function teamResult(ix: Index, t: Index["teams"][number]): SearchResult {
  const current = ix.currentTeamBySlug.get(t.teamId);
  const standing = ix.teamRank.get(t.teamId);
  return {
    kind: "team",
    label: current?.name ?? t.name,
    detail: `${t.firstYear}–${t.lastYear}`,
    meta: standing ? `P${standing.rank} · ${standing.points} pts` : undefined,
    image: current?.logoUrl ?? null,
    color: current ? (current.color ?? teamColor(current.name)) : null,
    href: archiveTeamHref(t.teamId),
  };
}

function circuitResult(ix: Index, c: ArchiveCircuit): SearchResult {
  const race = ix.raceByCircuit.get(c.circuitId);
  const upcoming = race && race.status !== "completed";
  return {
    kind: "circuit",
    label: c.name ?? c.circuitId,
    detail: [c.locality, c.country].filter(Boolean).join(", ") || undefined,
    meta: upcoming ? `Next ${shortDate(race.raceDate) ?? `round ${race.round}`}` : undefined,
    shape: circuitShape(race?.circuit, c.locality, c.name),
    href: archiveCircuitHref(c.circuitId),
  };
}

function archiveRaceResult(r: ArchiveRaceDoc): SearchResult {
  const winner = r.results.find((x) => x.position === 1);
  return { kind: "race", label: `${r.year} ${r.raceName}`, detail: winner ? `Won by ${winner.driverName}` : (r.circuitName ?? undefined), meta: shortDate(r.raceDate) ?? undefined, shape: circuitShape(r.locality, r.circuitName), href: sectionHref("archive", { year: r.year, round: r.round }) };
}

/** "<circuit> <year>" and "<driver> <year>": that race, or that driver's season. Past seasons come from the archive. */
async function yearResults(ix: Index, text: string, year: number): Promise<SearchResult[]> {
  if (year < ARCHIVE_EARLIEST_YEAR || year > ix.season) return [];
  const season: SearchResult = { kind: "season", label: `${year} season`, href: year === ix.season ? seasonHref(year) : archiveSeasonHref(year) };
  if (!text) return [season];
  if (year === ix.season) return [...rankMatches(text, ix.races, (r) => [r.name, r.circuit, r.country], currentRaceResult, 3), season];
  const races = await getArchiveSeason(year).catch(() => []);
  const raceHits = rankMatches(
    text,
    races,
    (r) => [r.raceName, r.circuitName, r.locality, r.country],
    archiveRaceResult,
    3,
  );
  // A driver's season: their points and wins that year, from the same archive read.
  const totals = new Map<string, { name: string; points: number; wins: number }>();
  for (const r of races)
    for (const x of r.results) {
      const t = totals.get(x.driverId) ?? { name: x.driverName, points: 0, wins: 0 };
      t.points += x.points;
      if (x.position === 1) t.wins += 1;
      totals.set(x.driverId, t);
    }
  const driverHits = rankMatches(
    text,
    [...totals.entries()],
    ([, t]) => [t.name],
    ([id, t]) => {
      const d = ix.drivers.find((x) => x.driverId === id);
      return { ...(d ? driverResult(ix, d) : {}), kind: "driver", label: `${t.name} in ${year}`, detail: `${t.wins} win${t.wins === 1 ? "" : "s"}`, meta: `${Math.round(t.points * 10) / 10} pts`, href: archiveDriverHref(id) };
    },
    2,
  );
  return [...raceHits, ...driverHits, season];
}

type GroupRow = { id: string; name: string; visibility: string; avatar_url: string | null };

/** The viewer's memberships, the communities matching the query they can see (public, or theirs) with member counts,
 * and the people in their communities matching it. */
async function communityResults(uid: string, query: string): Promise<{ communities: SearchResult[]; people: SearchResult[]; mine: GroupRow[] }> {
  const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data: memberships } = await supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid);
  const memberIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id);
  const visible = memberIds.length ? `visibility.eq.public,id.in.(${memberIds.join(",")})` : "visibility.eq.public";
  const [{ data: groups }, { data: mine }, { data: members }] = await Promise.all([
    query ? supabaseAdmin.from("groups").select("id, name, visibility, avatar_url").ilike("name", pattern).or(visible).limit(20) : Promise.resolve({ data: [] }),
    memberIds.length ? supabaseAdmin.from("groups").select("id, name, visibility, avatar_url").in("id", memberIds).limit(20) : Promise.resolve({ data: [] }),
    memberIds.length ? supabaseAdmin.from("group_members").select("group_id, user_id").in("group_id", memberIds).limit(2000) : Promise.resolve({ data: [] }),
  ]);
  const memberRows = (members ?? []) as { group_id: string; user_id: string }[];
  const found = (groups ?? []) as GroupRow[];
  const countIds = found.map((g) => g.id).filter((id) => !memberIds.includes(id));
  const { data: otherMembers } = countIds.length ? await supabaseAdmin.from("group_members").select("group_id").in("group_id", countIds).limit(5000) : { data: [] };
  const counts = new Map<string, number>();
  for (const m of [...memberRows, ...((otherMembers ?? []) as { group_id: string }[])]) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
  const toCommunity = (g: GroupRow): SearchResult => {
    const n = counts.get(g.id);
    return { kind: "community", label: g.name, detail: g.visibility === "public" ? "Community" : "Private community", meta: n ? `${n} member${n === 1 ? "" : "s"}` : undefined, image: g.avatar_url, href: groupHref(g.id) };
  };
  const communities = query ? rankMatches(query, found, (g) => [g.name], toCommunity) : [];

  let people: SearchResult[] = [];
  const groupOf = new Map<string, string>();
  for (const m of memberRows) if (m.user_id !== uid && !groupOf.has(m.user_id)) groupOf.set(m.user_id, m.group_id);
  if (query && groupOf.size) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, username, avatar")
      .in("id", [...groupOf.keys()].slice(0, 500))
      .or(`display_name.ilike.${pattern},username.ilike.${pattern}`)
      .limit(10);
    const groupName = new Map(((mine ?? []) as GroupRow[]).map((g) => [g.id, g.name]));
    people = rankMatches(
      query,
      (profiles ?? []) as { id: string; display_name: string | null; username: string | null; avatar: unknown }[],
      (p) => [p.display_name, p.username],
      (p) => ({ kind: "person", label: p.display_name ?? p.username ?? "Member", detail: [p.username ? `@${p.username}` : null, groupName.get(groupOf.get(p.id)!)].filter(Boolean).join(" · "), person: { id: p.id, avatar: parseAvatar(p.avatar) }, href: `${groupHref(groupOf.get(p.id)!)}&tab=members` }),
    );
  }
  return { communities, people, mine: (mine ?? []) as GroupRow[] };
}

function actionContext(ix: Index, mine: GroupRow[]): ActionContext {
  return {
    season: ix.season,
    nextRace: ix.nextRace ? { name: ix.nextRace.name, href: `${raceHref(ix.nextRace.year, ix.nextRace.round, ix.nextRace.name)}#pick` } : null,
    communities: mine.map((g) => ({ id: g.id, name: g.name, href: groupHref(g.id) })),
    drivers: [...ix.currentByCode.values()].map((d) => ({ code: d.code, name: d.name })),
    hrefs: {
      season: seasonHref(ix.season),
      archive: sectionHref("archive"),
      circuits: sectionHref("circuits"),
      communities: sectionHref("communities"),
      profile: sectionHref("profile"),
      notifications: profileHref("notifications"),
      predictions: profileHref("predictions"),
      account: "/profile/account",
      reportProblem: REPORT_PROBLEM_URL,
      compare: compareHref(ix.season),
    },
  };
}

/** The palette's results for a query; with no query, its suggestions: the next race, your favourites, your communities. */
export async function searchSite(uid: string, rawQuery: string): Promise<SearchResult[]> {
  const parsed = parseQuery(rawQuery.slice(0, MAX_QUERY_LENGTH));
  const ix = await loadIndex();

  if (parsed.mode === "actions") {
    const { mine } = await communityResults(uid, "");
    return matchActions(parsed.text, actionContext(ix, mine), 12);
  }
  if (parsed.mode === "empty") return suggestions(uid, ix);

  const { text, year, code } = parsed;
  const [{ communities, people, mine }, byYear] = await Promise.all([communityResults(uid, text), year !== null ? yearResults(ix, text, year) : Promise.resolve(null)]);
  const actions = matchActions(parsed.raw, actionContext(ix, mine), 3);
  if (byYear) return [...actions, ...byYear];

  // A driver code ("VER") goes straight to its driver, ahead of name matches.
  const codeHits = code ? ix.drivers.filter((d) => d.code === code).sort((a, b) => b.lastYear - a.lastYear).slice(0, 1).map((d) => driverResult(ix, d)) : [];
  const drivers = rankMatches(text, ix.drivers, (d) => [d.name, d.code], (d) => driverResult(ix, d)).filter((r) => !codeHits.some((c) => c.href === r.href));
  const results = [
    ...actions,
    ...rankMatches(text, ix.races, (r) => [r.name, r.circuit, r.country], currentRaceResult, 4),
    ...codeHits,
    ...drivers,
    ...rankMatches(text, ix.teams, (t) => [t.name, ix.currentTeamBySlug.get(t.teamId)?.name], (t) => teamResult(ix, t)),
    ...rankMatches(text, ix.circuits, (c) => [c.name, c.circuitId, c.locality, c.country], (c) => circuitResult(ix, c)),
    ...communities,
    ...people,
    ...rankMatches(text, SECTIONS, (s) => [s.label, s.detail], (s) => s),
  ];
  // A sentence ("everything about lewis hamilton") matches no name whole: answer with what it names instead.
  if (text.split(/\s+/).length >= 3 && !results.some((r) => r.kind !== "action" && r.kind !== "section")) return [...actions, ...(await sentenceResults(ix, text))];
  return results;
}

/** What a sentence names, grouped: the driver, the teams they drove for and their races (wins first); teams and circuits. */
async function sentenceResults(ix: Index, text: string): Promise<SearchResult[]> {
  const named = namedIn(ix, text);
  const driver = named.drivers[0];
  const history = driver ? await getArchiveEntityRaces("driver", driver.driverId).catch(() => [] as ArchiveRaceDoc[]) : [];
  const recentFirst = [...history].sort((a, b) => b.year - a.year || b.round - a.round);
  const wins = recentFirst.filter((r) => r.results.some((x) => x.driverId === driver?.driverId && x.position === 1));
  const races = (wins.length ? wins : recentFirst).slice(0, 4).map(archiveRaceResult);
  const driverTeams = (driver?.constructors ?? []).flatMap((name) => ix.teams.filter((t) => normalise(t.name) === normalise(name)));
  const teams = [...new Map([...named.teams, ...driverTeams].map((t) => [t.teamId, t])).values()].slice(0, 5);
  return [...races, ...named.drivers.slice(0, 3).map((d) => driverResult(ix, d)), ...teams.map((t) => teamResult(ix, t)), ...named.circuits.slice(0, 3).map((c) => circuitResult(ix, c))];
}

/** The drivers (full name, or surname for a recent one), teams and circuits a text names, as whole words. */
function namedIn(ix: Index, text: string) {
  const t = ` ${normalise(text).replace(/[^a-z0-9 ]+/g, " ")} `;
  const has = (name: string | null | undefined) => !!name && name.length >= 3 && t.includes(` ${normalise(name).replace(/[^a-z0-9 ]+/g, " ")} `);
  const lastName = (name: string) => name.split(" ").slice(-1)[0];
  return {
    has,
    drivers: [...ix.drivers.filter((d) => has(d.name)), ...ix.drivers.filter((d) => d.lastYear >= ix.season - 1 && !has(d.name) && has(lastName(d.name)))],
    teams: ix.teams.filter((tm) => has(tm.name) || has(ix.currentTeamBySlug.get(tm.teamId)?.name)),
    circuits: ix.circuits.filter((c) => has(c.name)),
  };
}

/** The archive drivers, teams and circuits a question names, for Ask Apex's whole-site context. */
export async function entitiesNamedIn(text: string): Promise<{ drivers: string[]; teams: string[]; circuits: string[] }> {
  const named = namedIn(await loadIndex(), text);
  return { drivers: named.drivers.map((d) => d.driverId), teams: named.teams.map((t) => t.teamId), circuits: named.circuits.map((c) => c.circuitId) };
}

async function suggestions(uid: string, ix: Index): Promise<SearchResult[]> {
  const [profile, { mine }] = await Promise.all([getUserProfile(uid).catch(() => null), communityResults(uid, "")]);
  const ctx = actionContext(ix, mine);
  const favDrivers = (profile?.favoriteDrivers ?? []).flatMap((id) => ix.drivers.filter((d) => d.driverId === id)).slice(0, 3);
  const favTeams = (profile?.favoriteTeams ?? []).flatMap((id) => ix.teams.filter((t) => t.teamId === id)).slice(0, 2);
  return [
    ...(ix.nextRace ? [currentRaceResult(ix.nextRace)] : []),
    ...matchActions("", { ...ctx, communities: [] }, 1),
    ...favDrivers.map((d) => driverResult(ix, d)),
    ...favTeams.map((t) => teamResult(ix, t)),
    ...mine.slice(0, 4).map((g): SearchResult => ({ kind: "community", label: g.name, detail: g.visibility === "public" ? "Community" : "Private community", image: g.avatar_url, href: groupHref(g.id) })),
  ];
}

/**
 * The pages an Apex answer's facts came from: the current drivers, teams, circuits and this season's races named in
 * the question or the answer. Only things that exist come back - this matches names, it never makes one up.
 */
export async function mentionedIn(text: string, limit = 5): Promise<SearchResult[]> {
  const ix = await loadIndex();
  const { has } = namedIn(ix, text);
  const lastName = (name: string) => name.split(" ").slice(-1)[0];
  const out: SearchResult[] = [];
  for (const r of ix.races) if (has(r.name)) out.push(currentRaceResult(r));
  for (const d of ix.drivers) if (d.lastYear >= ix.season - 1 && (has(d.name) || has(lastName(d.name)))) out.push(driverResult(ix, d));
  for (const tm of ix.teams) if (ix.currentTeamBySlug.has(tm.teamId) && (has(tm.name) || has(ix.currentTeamBySlug.get(tm.teamId)?.name))) out.push(teamResult(ix, tm));
  for (const c of ix.circuits) if (ix.raceByCircuit.has(c.circuitId) && (has(c.name) || has(c.locality))) out.push(circuitResult(ix, c));
  return out.slice(0, limit);
}
