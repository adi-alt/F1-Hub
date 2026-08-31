// Path-based routing for the year -> race hierarchy (Season and Archive both) - a deliberate
// reversal of this file's own original query-param convention, at the user's explicit request.
// Every race, from either section, opens at the same /race/<year>/<slug> route - "the race detail
// page must be identical regardless of where the user came from" - not two parallel route trees.
// Archive's circuit/driver/team detail views are NOT part of this change - they're a different
// "pick one of many" browsing pattern, not a year -> race drill-down.

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

/** `section` opens that tab on arrival (RaceTabShell reads it) - the path-routing equivalent of
 * the old `#hash`-style scroll-to-anchor `section` param this replaces, same name kept so every
 * existing call site's intent ("send the user straight to Qualifying/Simulation") still reads the
 * same way at the call site even though the destination mechanism changed. One route for every
 * race regardless of source (`round` isn't part of the URL, kept in the signature only so every
 * call site already has it in scope without a lookup - see /race/[year]/[slug]/page.tsx, which
 * re-resolves it from the slug anyway). */
export function raceHref(year: number, round: number, raceName: string, section?: string): string {
  const base = `/race/${year}/${slugifyRaceName(raceName)}`;
  return section ? `${base}?tab=${section}` : base;
}

export function seasonHref(year: number): string {
  return `/season?year=${year}`;
}

export function circuitHref(circuit: string): string {
  return `/circuits?circuit=${encodeURIComponent(circuit)}`;
}

export function archiveSeasonHref(year: number): string {
  return `/archive/${year}`;
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
