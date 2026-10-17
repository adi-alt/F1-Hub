// The track library (circuit_layouts, pipeline/circuit_layouts.py): one drawing per layout of a circuit, with the
// seasons it was used, so any race draws its circuit by (circuit, season). Client-safe: types, the shape check,
// choosing a race's layout, and turning a measured layout into the shape the circuit view draws.
import type { RaceTrackStory } from "./raceTrackStory";
import { projectTrack, smoothClosedPath, TRACK_STORY_VERSION } from "./raceTrackStory";

type XY = [number, number];

export type DrawnLayout = {
  layoutId: string;
  source: "drawn";
  seasons: number[];
  raceNameMatch: string | null;
  /** An SVG path on its own canvas: a drawing, in no real coordinate frame. */
  path: string;
  viewBox: string;
  attribution: string | null;
};

export type MeasuredLayout = {
  layoutId: string;
  source: "measured";
  seasons: number[];
  raceNameMatch: string | null;
  /** Traced from car positions, in F1's track coordinates (decimetres). */
  outline: XY[];
  lapLengthM: number;
  startFinish: { x: number; y: number };
  rotation: number | null;
  corners: { number: number; letter: string; x: number; y: number }[];
  attribution: string | null;
};

export type CircuitLayout = DrawnLayout | MeasuredLayout;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isXY = (v: unknown): v is XY => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** A circuit_layouts row as this app can draw it, or null. Anything malformed is dropped whole. */
export function parseLayout(row: Record<string, unknown> | null | undefined): CircuitLayout | null {
  if (!row || typeof row !== "object") return null;
  const seasons = row.seasons;
  if (typeof row.layout_id !== "string" || !Array.isArray(seasons) || !seasons.length || !seasons.every(isNum)) return null;
  const g = row.geometry as Record<string, unknown> | null;
  if (!g || typeof g !== "object") return null;
  const base = {
    layoutId: row.layout_id,
    seasons: seasons as number[],
    raceNameMatch: typeof row.race_name_match === "string" ? row.race_name_match : null,
    attribution: typeof row.attribution === "string" ? row.attribution : null,
  };
  if (row.source === "drawn") {
    if (typeof g.path !== "string" || !g.path || typeof g.viewBox !== "string" || g.viewBox.split(/\s+/).length !== 4) return null;
    return { ...base, source: "drawn", path: g.path, viewBox: g.viewBox };
  }
  if (row.source === "measured") {
    const sf = g.startFinish as Record<string, unknown> | undefined;
    const corners = Array.isArray(g.corners) ? g.corners : [];
    if (!Array.isArray(g.outline) || g.outline.length < 50 || !g.outline.every(isXY) || !isNum(g.lapLengthM) || !sf || !isNum(sf.x) || !isNum(sf.y)) return null;
    if (!corners.every((c) => c && isNum(c.number) && typeof c.letter === "string" && isNum(c.x) && isNum(c.y))) return null;
    return { ...base, source: "measured", outline: g.outline as XY[], lapLengthM: g.lapLengthM, startFinish: { x: sf.x, y: sf.y }, rotation: isNum(g.rotation) ? g.rotation : null, corners: corners as MeasuredLayout["corners"] };
  }
  return null;
}

/**
 * The layout a race was run on: of those covering its season, a measured one before a drawn one (the real
 * geometry over a drawing), and a variant named for this race ("sakhir" for the 2020 Sakhir GP) before the
 * circuit's usual layout. A variant never stands in for a race it wasn't named for. Null when nothing covers the
 * season - never a neighbouring season's layout.
 */
export function chooseLayout(layouts: CircuitLayout[], year: number, raceName: string): CircuitLayout | null {
  const name = raceName.toLowerCase();
  const fits = layouts.filter((l) => l.seasons.includes(year) && (l.raceNameMatch === null || name.includes(l.raceNameMatch.toLowerCase())));
  const rank = (l: CircuitLayout) => (l.raceNameMatch ? 0 : 2) + (l.source === "measured" ? 0 : 1);
  return fits.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/**
 * The layout to show for a race still to come, which no layout covers yet: the circuit's latest one, if it was raced
 * last season or this one (a track that hasn't been raced for years may have changed). Measured before drawn. The
 * caller says it's "as last raced" - this is a stand-in for a layout that doesn't exist yet, never a claim about it.
 */
export function latestLayout(layouts: CircuitLayout[], year: number): CircuitLayout | null {
  const recent = layouts.filter((l) => !l.raceNameMatch && Math.max(...l.seasons) >= year - 1);
  const last = (l: CircuitLayout) => Math.max(...l.seasons);
  return recent.sort((a, b) => last(b) - last(a) || Number(b.source === "measured") - Number(a.source === "measured"))[0] ?? null;
}

/**
 * The one drawing to show for a circuit this season, wherever it's shown (the circuits home's card, the circuit
 * page's head), so the two can never disagree: the layout this season's race ran on (chooseLayout), else its latest
 * recent one (latestLayout, for a race still to come), else its most recent usual layout of any year, so a circuit
 * whose data stops short of this season still has its shape drawn rather than a blank card. Never a variant named
 * for a different race.
 */
export function displayLayout(layouts: CircuitLayout[], year: number, raceName: string): CircuitLayout | null {
  return chooseLayout(layouts, year, raceName) ?? latestLayout(layouts, year) ?? latestLayout(layouts, 0);
}

/** A measured layout in the shape the circuit view draws: the same geometry, with nothing on it located (this
 * race has no positions of its own) and the timing line not claimed (it can move between seasons). */
export function layoutAsTrack(layout: MeasuredLayout): RaceTrackStory {
  return {
    version: TRACK_STORY_VERSION,
    lapLengthM: layout.lapLengthM,
    outline: layout.outline,
    startFinish: { ...layout.startFinish, verified: false },
    rotation: layout.rotation,
    corners: layout.corners,
    leadChanges: [],
  };
}

/** "1950-1954, 1960-1961": a layout's seasons as ranges, for its caption. */
export function seasonRanges(seasons: number[]): string {
  const ys = [...new Set(seasons)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < ys.length; i++) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++;
    out.push(i === j ? `${ys[i]}` : `${ys[i]}–${ys[j]}`);
    i = j;
  }
  return out.join(", ");
}

/** A layout as the circuit pages draw it: a ready SVG path (smoothed, in SVG units), so the client is sent a few
 * kilobytes of path rather than every traced point. Turn numbers only for a measured layout with verified corners. */
export type CircuitDrawing = {
  layoutId: string;
  source: "drawn" | "measured";
  seasons: number[];
  viewBox: string;
  path: string;
  turns: { label: string; x: number; y: number }[];
  attribution: string | null;
};

export function layoutToDrawing(layout: CircuitLayout): CircuitDrawing {
  if (layout.source === "drawn") {
    return { layoutId: layout.layoutId, source: "drawn", seasons: layout.seasons, viewBox: layout.viewBox, path: layout.path, turns: [], attribution: layout.attribution };
  }
  const track = layoutAsTrack(layout);
  const proj = projectTrack(track);
  return {
    layoutId: layout.layoutId,
    source: "measured",
    seasons: layout.seasons,
    viewBox: proj.viewBox,
    path: smoothClosedPath(proj.points),
    turns: layout.corners.map((c) => {
      const [x, y] = proj.toSvg(c.x, c.y);
      return { label: `${c.number}${c.letter}`, x: Math.round(x), y: Math.round(y) };
    }),
    attribution: layout.attribution,
  };
}

/** Every layout of a circuit as eras, oldest first. Where a measured and a drawn layout cover the same seasons the
 * measured one wins (the real geometry over a drawing): a drawing keeps only the seasons no measured layout covers,
 * and goes altogether when none are left. A variant (one race's layout) is its own era, named for its race. */
export function circuitEras(layouts: CircuitLayout[]): CircuitLayout[] {
  const measuredYears = new Set(layouts.filter((l) => l.source === "measured" && !l.raceNameMatch).flatMap((l) => l.seasons));
  const eras = layouts
    .map((l) => (l.source === "drawn" && !l.raceNameMatch ? { ...l, seasons: l.seasons.filter((y) => !measuredYears.has(y)) } : l))
    .filter((l) => l.seasons.length > 0);
  return eras.sort((a, b) => Math.min(...a.seasons) - Math.min(...b.seasons) || Number(!!a.raceNameMatch) - Number(!!b.raceNameMatch));
}

/** A short label for a layout's seasons: "2010–2017", "2021", or - for a circuit that shared its Grand Prix with
 * another venue in the early years (Silverstone's 1950s) - just the span, "1950–1973", not every year. */
export function seasonLabel(seasons: number[]): string {
  const ranges = seasonRanges(seasons).split(", ");
  if (ranges.length <= 2) return ranges.join(", ");
  const ys = [...seasons].sort((a, b) => a - b);
  return `${ys[0]}–${ys[ys.length - 1]}`;
}
