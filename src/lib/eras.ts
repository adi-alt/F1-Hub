// The one place F1's historical eras are defined - no component ever compares a year against a
// literal number, every year-to-era lookup goes through eraForYear/groupYearsByEra below. Adding a
// new season (2027, 2028, ...) needs zero changes here or anywhere that consumes this: it falls
// under whichever era has endYear: null automatically. A genuine future regulation reset just means
// adding one new row to ERAS (closing off the previously-open-ended era's endYear, opening a new
// one) - nothing in the Archive UI hardcodes a boundary itself.
//
// These boundaries are an editorial judgment call, not an objective standard - F1 itself doesn't
// draw universally agreed lines here (engine formats genuinely overlapped for years at a few of
// these transitions, most notably 1977-1988 and 1989-1994, both called out below). Each
// description says so honestly rather than asserting false precision.

export type Era = {
  id: string;
  name: string;
  startYear: number;
  /** null = open-ended - the current, still-running era. Only the last entry in ERAS should ever
   * have this, and every UI consumer treats it as "extends to whatever the latest season is." */
  endYear: number | null;
  description: string;
};

export const ERAS: Era[] = [
  {
    id: "front-engine",
    name: "Front-Engine Era",
    startYear: 1950,
    endYear: 1960,
    description: "Front-engined cars on narrow tyres, before the rear/mid-engine layout took over the grid.",
  },
  {
    id: "rear-engine",
    name: "Rear-Engine Era",
    startYear: 1961,
    endYear: 1976,
    description:
      "Cooper and Lotus popularized the rear/mid-engine layout; naturally aspirated engines from 1.5 up to 3.0 litres, dominated for much of the period by the Cosworth DFV V8.",
  },
  {
    id: "turbo",
    name: "Turbo Era",
    startYear: 1977,
    endYear: 1988,
    description:
      "Forced-induction turbocharged engines arrived and eventually came to dominate the grid, coexisting with naturally aspirated cars until turbos were banned after 1988.",
  },
  {
    id: "v12",
    name: "V12 Era",
    startYear: 1989,
    endYear: 1994,
    description:
      "A return to naturally aspirated engines after the turbo ban - V8, V10, and V12 configurations genuinely coexisted through this period; V12 is its best-known engine, fielded by Ferrari, Honda, and others.",
  },
  {
    id: "v10",
    name: "V10 Era",
    startYear: 1995,
    endYear: 2005,
    description: "The 3.0-litre V10 became the standard engine format, and eventually the mandatory one.",
  },
  {
    id: "v8",
    name: "V8 Era",
    startYear: 2006,
    endYear: 2013,
    description: "2.4-litre naturally aspirated V8s were mandated across the grid.",
  },
  {
    id: "turbo-hybrid",
    name: "Turbo-Hybrid Era",
    startYear: 2014,
    endYear: 2021,
    description: "1.6-litre turbocharged V6 hybrid power units replaced naturally aspirated engines.",
  },
  {
    id: "modern",
    name: "Modern Era",
    startYear: 2022,
    endYear: null,
    description: "A new generation of ground-effect aerodynamic regulations, alongside continued turbo-hybrid V6 power units.",
  },
];

/** The era a given year falls under. Falls back to the last (open-ended) era for anything past its
 * startYear that isn't otherwise covered - a genuinely future season with no matching row yet
 * still resolves to "the current era" rather than to nothing. */
export function eraForYear(year: number): Era {
  const match = ERAS.find((e) => year >= e.startYear && (e.endYear === null || year <= e.endYear));
  return match ?? ERAS[ERAS.length - 1];
}

/** Groups a list of years by era, most-recent-era-first, years within each era sorted descending -
 * the exact ordering ArchiveSeasonGrid renders (most recent season, and most recent era, at the
 * top). Only eras that actually have at least one of the given years appear in the result. */
export function groupYearsByEra(years: number[]): { era: Era; years: number[] }[] {
  const byEraId = new Map<string, number[]>();
  for (const year of years) {
    const era = eraForYear(year);
    const list = byEraId.get(era.id);
    if (list) list.push(year);
    else byEraId.set(era.id, [year]);
  }
  return ERAS.filter((e) => byEraId.has(e.id))
    .reverse()
    .map((era) => ({ era, years: (byEraId.get(era.id) ?? []).sort((a, b) => b - a) }));
}

// A second, unrelated year boundary - not one of the engine eras above. F1 only summed a driver's
// *entire* season toward the title from 1991 onward; before that it counted just the best N
// results in various forms, which can (and, in 1988, demonstrably did - Prost outscored Senna on a
// full-season points sum, Senna won the actual title) diverge from a plain sum. Archive's year-card
// tooltip (src/lib/supabase/archive.ts's getArchiveYearStats) always computes a real points sum for
// every year, never a fabricated one - this is the one place that draws the line between "this sum
// happens to equal the real champion" (1991+, label it "Champion") and "this sum is an
// approximation, not verified against the real rule" (1950-1990, label it "Most Points" instead).
// No other file should compare a year against 1991 directly - call isVerifiedChampionYear. Lives
// here, not in supabase/archive.ts, specifically so it stays safely importable from client
// components (see that file's own comment on why - a pure function with zero database dependency
// has no business pulling in supabaseAdmin's initialization).
export const FULL_SEASON_SCORING_START_YEAR = 1991;
export function isVerifiedChampionYear(year: number): boolean {
  return year >= FULL_SEASON_SCORING_START_YEAR;
}
