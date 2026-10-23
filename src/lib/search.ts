// Site search for the command palette (audit R-55, F-14): drivers, teams, circuits, this season's races,
// seasons, the communities the viewer can see, and the site's sections. The matching is pure (rankMatches)
// so it can be tested; searchSite gathers the candidates from cached reads, so a keystroke costs one
// communities query and nothing else.
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAllArchiveCircuits, getAllArchiveDrivers, getAllArchiveTeams } from "@/lib/supabase/archive";
import { getRaceListByYear } from "@/lib/supabase/races";
import { getCurrentSeason } from "@/lib/currentSeason";
import { ARCHIVE_EARLIEST_YEAR } from "@/lib/archiveYears";
import { archiveCircuitHref, archiveDriverHref, archiveSeasonHref, archiveTeamHref, groupHref, raceHref, seasonHref } from "@/lib/routes";
import { sectionHref } from "@/lib/sectionRoutes";

export type SearchKind = "section" | "driver" | "team" | "circuit" | "race" | "season" | "community";
export type SearchResult = { kind: SearchKind; label: string; detail?: string; href: string };

const PER_KIND = 5;
export const MAX_QUERY_LENGTH = 60;

const SECTIONS: SearchResult[] = [
  { kind: "section", label: "Season", detail: "Standings, races and analysis", href: sectionHref("season") },
  { kind: "section", label: "Circuits", detail: "Every track on the calendar", href: sectionHref("circuits") },
  { kind: "section", label: "Archive", detail: "Every race since 1950", href: sectionHref("archive") },
  { kind: "section", label: "Communities", detail: "Feeds, predictions and leagues", href: sectionHref("communities") },
  { kind: "section", label: "Profile", detail: "Your account and favourites", href: sectionHref("profile") },
];

const normalise = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** 0: the label starts with the query, 1: a word in it does, 2: it contains it; null: no match. */
export function matchScore(query: string, ...texts: (string | null | undefined)[]): number | null {
  const q = normalise(query);
  let best: number | null = null;
  for (const text of texts) {
    if (!text) continue;
    const t = normalise(text);
    const score = t.startsWith(q) ? 0 : t.split(/[\s\-/]+/).some((w) => w.startsWith(q)) ? 1 : t.includes(q) ? 2 : null;
    if (score !== null && (best === null || score < best)) best = score;
  }
  return best;
}

/** The best `PER_KIND` matches of one kind, best first, then shortest label. */
export function rankMatches<T>(query: string, items: readonly T[], texts: (item: T) => (string | null | undefined)[], toResult: (item: T) => SearchResult): SearchResult[] {
  return items
    .map((item) => ({ item, score: matchScore(query, ...texts(item)) }))
    .filter((m): m is { item: T; score: number } => m.score !== null)
    .sort((a, b) => a.score - b.score || toResult(a.item).label.length - toResult(b.item).label.length)
    .slice(0, PER_KIND)
    .map((m) => toResult(m.item));
}

export function seasonResults(query: string, currentSeason: number): SearchResult[] {
  if (!/^\d{4}$/.test(query.trim())) return [];
  const year = Number(query.trim());
  if (year < ARCHIVE_EARLIEST_YEAR || year > currentSeason) return [];
  return [{ kind: "season", label: `${year} season`, href: year === currentSeason ? seasonHref(year) : archiveSeasonHref(year) }];
}

/** Communities the viewer can open: public ones, and private ones they belong to. */
async function visibleCommunities(uid: string, query: string): Promise<SearchResult[]> {
  const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data: memberships } = await supabaseAdmin.from("group_members").select("group_id").eq("user_id", uid);
  const memberIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id);
  const visible = memberIds.length ? `visibility.eq.public,id.in.(${memberIds.join(",")})` : "visibility.eq.public";
  const { data, error } = await supabaseAdmin.from("groups").select("id, name, visibility").ilike("name", pattern).or(visible).limit(20);
  if (error) return [];
  return rankMatches(query, (data ?? []) as { id: string; name: string; visibility: string }[], (g) => [g.name], (g) => ({ kind: "community", label: g.name, detail: g.visibility === "public" ? "Community" : "Private community", href: groupHref(g.id) }));
}

export async function searchSite(uid: string, rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  if (query.length < 2) return [];
  const season = await getCurrentSeason();
  const [drivers, teams, circuits, races, communities] = await Promise.all([
    getAllArchiveDrivers().catch(() => []),
    getAllArchiveTeams().catch(() => []),
    getAllArchiveCircuits().catch(() => []),
    getRaceListByYear(season).catch(() => []),
    visibleCommunities(uid, query),
  ]);
  return [
    ...rankMatches(query, SECTIONS, (s) => [s.label], (s) => s),
    ...seasonResults(query, season),
    ...rankMatches(query, drivers, (d) => [d.name, d.code], (d) => ({ kind: "driver", label: d.name, detail: `${d.firstYear}–${d.lastYear}`, href: archiveDriverHref(d.driverId) })),
    ...rankMatches(query, teams, (t) => [t.name], (t) => ({ kind: "team", label: t.name, detail: `${t.firstYear}–${t.lastYear}`, href: archiveTeamHref(t.teamId) })),
    ...rankMatches(query, circuits, (c) => [c.name, c.circuitId], (c) => ({ kind: "circuit", label: c.name ?? c.circuitId, href: archiveCircuitHref(c.circuitId) })),
    ...rankMatches(query, races, (r) => [r.name, r.circuit, r.country], (r) => ({ kind: "race", label: r.name, detail: `${season} round ${r.round}`, href: raceHref(r.year, r.round, r.name) })),
    ...communities,
  ];
}
