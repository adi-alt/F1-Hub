// Shared between src/app/profile/page.tsx (merging current-season circuits into the archive-
// sourced favorites list) and the homepage's track-history section (resolving the upcoming
// race's own `circuit` string back to whichever archive circuit_id, if any, it corresponds to) -
// both directions of the same current-season <-> archive reconciliation problem, so they share
// one source of truth instead of two copies drifting apart (same reasoning as lib/teamSlug.ts).

// The current season's own `location` field is the host CITY ("Melbourne"), while archive's own
// circuit name is the track itself ("Albert Park Grand Prix Circuit") — an exact-name match never
// hits. Maps straight to the archive's own circuitId, not a re-derived slug.
//
// Three current tracks — Miami, Las Vegas, Losail/Qatar — aren't in archive_circuits at all yet
// (enrich_archive_circuits.py hasn't reached 2018+), so they're deliberately left unmapped; that's
// a real, separate, self-resolving gap, not a naming mismatch. "Kuala Lumpur" (2026 calendar round
// 16, labeled "Bahrain Grand Prix") looks like a genuine data bug in the calendar collection
// itself — country says Bahrain, location says Malaysia — left unmapped rather than guessed at;
// worth checking calendar's own source data separately.
export const CURRENT_SEASON_CIRCUIT_ALIASES: Record<string, string> = {
  melbourne: "albert_park",
  shanghai: "shanghai",
  suzuka: "suzuka",
  montréal: "villeneuve",
  "monte carlo": "monaco",
  barcelona: "catalunya",
  spielberg: "red_bull_ring",
  silverstone: "silverstone",
  "spa-francorchamps": "spa",
  budapest: "hungaroring",
  zandvoort: "zandvoort",
  monza: "monza",
  baku: "baku",
  "marina bay": "marina_bay",
  austin: "americas",
  "mexico city": "rodriguez",
  "são paulo": "interlagos",
  "yas marina": "yas_marina",
};

// Strips accents/diacritics and case so "Montréal" and "Montreal" compare equal without needing
// an alias entry for every future spelling variant a data source happens to use.
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks, once NFD has split them out
    .toLowerCase()
    .trim();
}

/** A circuit's own display name changes with sponsorship ("Red Bull Ring" could become anything
 * next); its host city almost never does. Matching the current season's `location` against
 * archive's own `locality` (both are just "what city is this in") catches most future renames on
 * its own — CURRENT_SEASON_CIRCUIT_ALIASES above only exists for the handful of cases even this
 * can't resolve (Yas Marina's own locality is recorded as "Abu Dhabi", a real exception, not a
 * spelling variant). Substring containment (not just equality) is what makes "Miami Gardens"
 * resolve against an archive locality of "Miami", or "Spa-Francorchamps" against "Spa". */
export function localityMatches(currentLocation: string, archiveLocality: string): boolean {
  const a = normalizeText(currentLocation);
  const b = normalizeText(archiveLocality);
  return a === b || a.includes(b) || b.includes(a);
}

/** Resolution priority: explicit alias, then locality match, then (if a name map is passed) an
 * exact-name fallback — same order src/app/profile/page.tsx's mergeCurrentSeason already used
 * inline. Returns null for a circuit the archive genuinely doesn't have yet (see the alias
 * table's own comment), not an error - callers should treat that as "no track history available"
 * rather than throw. */
export function resolveCurrentCircuitToArchiveId(
  location: string,
  circuitLocalities: Map<string, string>,
  circuitIdsByName?: Map<string, string>,
): string | null {
  const key = location.trim().toLowerCase();
  const aliasId = CURRENT_SEASON_CIRCUIT_ALIASES[key];
  if (aliasId) return aliasId;
  const localityMatchId = [...circuitLocalities.entries()].find(([, locality]) => localityMatches(location, locality))?.[0];
  if (localityMatchId) return localityMatchId;
  return circuitIdsByName?.get(key) ?? null;
}
