// Query-parameterized routing for the year -> race hierarchy (Season and Archive both), matching
// this file's own original convention and every other Archive facet (?circuit=, ?driver=, ?team=)
// - archive is a browsing page over query params, not a path-segment resource hierarchy. Every
// race, from either section, still opens at the one shared /race?year=&race= route - "the race
// detail page must be identical regardless of where the user came from" - just via a query string
// instead of path segments.

/** Lowercase, non-alphanumeric runs collapsed to a single hyphen, trimmed - "Australian Grand
 * Prix" -> "australian-grand-prix". Race names are unique within a single season (Season's
 * `RaceDoc.name` and Archive's `ArchiveRaceDoc.raceName` alike), so slugifying the name and
 * matching it back against that year's own race list is a safe, simple resolve - no id/round
 * needs to live in the URL itself. */
export function slugifyRaceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `section` opens that tab on arrival (RaceTabShell reads it via useUrlParam, which preserves
 * every other param already on the URL, `year`/`race` included) - same name kept from the old
 * `#hash`-style scroll-to-anchor `section` param this originally replaced, so every existing call
 * site's intent ("send the user straight to Qualifying/Simulation") still reads the same way. One
 * route for every race regardless of source (`round` isn't part of the URL, kept in the signature
 * only so every call site already has it in scope without a lookup - see /race/page.tsx, which
 * re-resolves it from the slug anyway). */
export function raceHref(year: number, round: number, raceName: string, section?: string): string {
  const base = `/race?year=${year}&race=${slugifyRaceName(raceName)}`;
  return section ? `${base}&tab=${section}` : base;
}

export function seasonHref(year: number): string {
  return `/season?year=${year}`;
}

export function circuitHref(circuit: string): string {
  return `/circuits?circuit=${encodeURIComponent(circuit)}`;
}

export function archiveSeasonHref(year: number): string {
  return `/archive?year=${year}`;
}

export function archiveCircuitHref(circuitId: string): string {
  return `/archive?circuit=${encodeURIComponent(circuitId)}`;
}

export function archiveDriverHref(driverId: string): string {
  return `/archive?driver=${encodeURIComponent(driverId)}`;
}

export function archiveTeamHref(teamId: string): string {
  return `/archive?team=${encodeURIComponent(teamId)}`;
}

// Not query-param routed, unlike the above — a group is a real resource with its own id-scoped
// page, same style as /profile or /models, not a filtered view over a shared collection.
export function groupHref(id: string): string {
  return `/groups/${id}`;
}
