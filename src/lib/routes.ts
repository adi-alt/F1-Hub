import { sectionHref } from "@/lib/sectionRoutes";
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

/** `section` scrolls to that section on arrival (useScrollToSection reads it, matching an element
 * `id={section}` on the target page) - same name kept from the old `#hash`-style scroll-to-anchor
 * `section` param this originally replaced (and later, briefly, a tab-switch param before the race
 * page dropped its tab shell for a flowing dashboard), so every existing call site's intent ("send
 * the user straight to Qualifying/Simulation") still reads the same way regardless of how the
 * destination page actually presents that section. One route for every race regardless of source
 * (`round` isn't part of the URL, kept in the signature only so every call site already has it in
 * scope without a lookup - see /race/page.tsx, which re-resolves it from the slug anyway). */
export function raceHref(year: number, round: number, raceName: string, section?: string): string {
  return sectionHref("season", { year, race: slugifyRaceName(raceName), tab: section });
}

// Every page is `/?section=<header name>&...` (lib/sectionRoutes.ts); these build each entity's URL in that shape.
// Old path-style links (/archive?team=, /groups?id=, /circuits/<slug>, /race/<year>/<slug>, ...) redirect to them.
export function seasonHref(year: number): string {
  return sectionHref("season", { year });
}

export function circuitHref(circuit: string): string {
  return sectionHref("circuits", { circuit: slugifyRaceName(circuit) });
}

export function circuitsHref(): string {
  return sectionHref("circuits");
}

export function archiveHref(tab?: "year" | "track" | "driver" | "team"): string {
  return sectionHref("archive", { tab: tab === "year" ? undefined : tab });
}

export function archiveSeasonHref(year: number): string {
  return sectionHref("archive", { year });
}

export function archiveCircuitHref(circuitId: string): string {
  return sectionHref("archive", { circuit: circuitId });
}

export function archiveDriverHref(driverId: string): string {
  return sectionHref("archive", { driver: driverId });
}

export function archiveTeamHref(teamId: string): string {
  return sectionHref("archive", { team: teamId });
}

/** The Communities home. */
export function communitiesHref(): string {
  return sectionHref("communities");
}

/** A community. Further parameters (`tab`, `post`, `invite`) are appended with `&`. */
export function groupHref(id: string): string {
  return sectionHref("communities", { id });
}

/** The account: personalisation (the default), notifications or profile. */
export function profileHref(tab?: "personalisation" | "notifications" | "profile", kind?: string): string {
  return sectionHref("profile", { tab, kind });
}
