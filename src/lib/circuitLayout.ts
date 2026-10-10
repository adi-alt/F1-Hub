// The track library (circuit_layouts, pipeline/circuit_layouts.py): one drawing per layout of a circuit, with the
// seasons it was used, so any race draws its circuit by (circuit, season). Client-safe: types, the shape check,
// choosing a race's layout, and turning a measured layout into the shape the circuit view draws.
import type { RaceTrackStory } from "./raceTrackStory";
import { TRACK_STORY_VERSION } from "./raceTrackStory";

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
