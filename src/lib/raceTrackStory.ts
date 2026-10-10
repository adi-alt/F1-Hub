// A race's real circuit and where on it the lead changed hands (pipeline/race_track_story.py,
// race_track_stories). Client-safe: types, the shape check, and the geometry the circuit view draws with.

/** The shape this app understands; a story with any other version is ignored, never half-read. */
export const TRACK_STORY_VERSION = 1;

type XY = [number, number];

export type TrackLeadChange =
  | { lap: number; from: string; to: string; kind: "pit" | "unlocated" }
  | {
      lap: number;
      from: string;
      to: string;
      kind: "pass";
      x: number;
      y: number;
      /** Metres from the timing line along the lap. */
      alongM: number;
      /** "verified": located to within 25 m with both cars on the racing line. "approximate": the samples around
       * the move were too far apart, or a car was off the line - shown as a distance with its uncertainty. */
      precision: "verified" | "approximate";
      /** How far off the location could be, along the track, in metres. */
      uncertaintyM: number;
      /** "into Turn 4" or "between Turn 4 and Turn 5": only for a verified location at a circuit with verified
       * corners, else null. */
      near: string | null;
      /** Several crossovers before it stuck: a battle, this is where the decisive one happened. */
      battle: boolean;
      /** How long after the move the timing feed re-ordered the cars. */
      recordedLaterS: number;
    };

export type RaceTrackStory = {
  version: number;
  lapLengthM: number;
  /** One clean lap, in the feed's decimetre coordinates, starting at the timing line. */
  outline: XY[];
  startFinish: { x: number; y: number; verified: boolean };
  /** F1's display rotation in degrees, present only with verified corners. */
  rotation: number | null;
  corners: { number: number; letter: string; x: number; y: number }[];
  leadChanges: TrackLeadChange[];
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isXY = (v: unknown): v is XY => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** The story when it's one this app can draw, else null. Anything malformed is dropped whole: half a
 * circuit is worse than the fallback route. */
export function parseTrackStory(raw: unknown): RaceTrackStory | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.version !== TRACK_STORY_VERSION || !isNum(s.lapLengthM)) return null;
  if (!Array.isArray(s.outline) || s.outline.length < 50 || !s.outline.every(isXY)) return null;
  const sf = s.startFinish as Record<string, unknown> | undefined;
  if (!sf || !isNum(sf.x) || !isNum(sf.y) || typeof sf.verified !== "boolean") return null;
  const corners = Array.isArray(s.corners) ? s.corners : [];
  if (!corners.every((c) => c && isNum(c.number) && typeof c.letter === "string" && isNum(c.x) && isNum(c.y))) return null;
  const changes = Array.isArray(s.leadChanges) ? s.leadChanges : [];
  const changeOk = (c: Record<string, unknown>) =>
    c && isNum(c.lap) && typeof c.from === "string" && typeof c.to === "string" &&
    (c.kind === "pit" ||
      c.kind === "unlocated" ||
      (c.kind === "pass" &&
        isNum(c.x) &&
        isNum(c.y) &&
        isNum(c.alongM) &&
        isNum(c.uncertaintyM) &&
        (c.precision === "verified" || c.precision === "approximate") &&
        // A turn name is a precise claim: a story naming a turn for an approximate location is malformed.
        (c.near === null || (typeof c.near === "string" && c.precision === "verified"))));
  if (!changes.every(changeOk)) return null;
  return {
    version: TRACK_STORY_VERSION,
    lapLengthM: s.lapLengthM,
    outline: s.outline as XY[],
    startFinish: { x: sf.x, y: sf.y, verified: sf.verified },
    rotation: isNum(s.rotation) ? s.rotation : null,
    corners: corners as RaceTrackStory["corners"],
    leadChanges: changes as TrackLeadChange[],
  };
}

/**
 * The lead change behind a storyline chapter: the same new leader, on the chapter's lap or one either side.
 * The two sources count laps differently at the line - race_laps by the leader at each lap's end, the timing
 * feed by when the order changed - so a change right at the line can land on adjacent laps.
 */
export function matchLeadChange(story: RaceTrackStory, lap: number, newLeader: string): TrackLeadChange | null {
  const candidates = story.leadChanges.filter((c) => c.to === newLeader && Math.abs(c.lap - lap) <= 1);
  return candidates.sort((a, b) => Math.abs(a.lap - lap) - Math.abs(b.lap - lap))[0] ?? null;
}

export type TrackProjection = {
  viewBox: string;
  /** Feed coordinates to SVG coordinates: rotated to F1's orientation, y flipped (the feed's y points up). */
  toSvg: (x: number, y: number) => XY;
  /** The outline in SVG coordinates. */
  points: XY[];
};

/** Fits the circuit into an SVG box, oriented as F1's graphics show it when the rotation is known (the same
 * transform FastF1's circuit plots apply). The margin is `padShare` of the circuit's larger side, so turn
 * labels beside the track stay inside the box whatever the circuit's size; or exactly `pad` units if given. */
export function projectTrack(story: RaceTrackStory, pad?: number, padShare = 0.08): TrackProjection {
  const a = ((story.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // FastF1: xy @ [[cos, sin], [-sin, cos]], plotted with y up.
  const rot = (x: number, y: number): XY => [x * cos - y * sin, x * sin + y * cos];
  const rotated = story.outline.map(([x, y]) => rot(x, y));
  const xs = rotated.map((p) => p[0]);
  const ys = rotated.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const margin = pad ?? padShare * Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys));
  const width = Math.max(...xs) - minX + margin * 2;
  const height = maxY - Math.min(...ys) + margin * 2;
  const toSvg = (x: number, y: number): XY => {
    const [rx, ry] = rot(x, y);
    return [rx - minX + margin, maxY - ry + margin];
  };
  return { viewBox: `0 0 ${Math.round(width)} ${Math.round(height)}`, toSvg, points: story.outline.map(([x, y]) => toSvg(x, y)) };
}

/** A smooth closed path through the points (Catmull-Rom as cubic Béziers): the feed samples at ~4 Hz, so
 * straight segments would show as facets in fast corners. Passes through every real sample. */
export function smoothClosedPath(points: XY[]): string {
  const n = points.length;
  if (n < 3) return "";
  const p = (i: number) => points[(i + n) % n];
  let d = `M${p(0)[0].toFixed(0)},${p(0)[1].toFixed(0)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1: XY = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: XY = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(0)},${c1[1].toFixed(0)} ${c2[0].toFixed(0)},${c2[1].toFixed(0)} ${p2[0].toFixed(0)},${p2[1].toFixed(0)}`;
  }
  return `${d}Z`;
}

/** The outline's points within `metres` either side of a distance along the lap, in order, wrapping through
 * the line: the stretch of track a chapter happened on, for the highlight. */
export function stretchAround(points: XY[], lapLengthM: number, alongM: number, metres: number): XY[] {
  const n = points.length;
  // Real distance along the outline, not sample count: samples come at ~4 Hz, so they bunch up in slow corners.
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const [a, b] = [points[i - 1], points[i % n]];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const scale = lapLengthM / cum[n]; // SVG units -> metres
  const lap = lapLengthM;
  const out: XY[] = [];
  for (let i = 0; i < n; i++) {
    const d = ((cum[i] * scale - alongM + lap * 1.5) % lap) - lap / 2; // signed distance, wrapped to ±half a lap
    if (Math.abs(d) <= metres) out.push(points[i]);
  }
  // Order from the start of the stretch, so a stretch through the line doesn't jump across the circuit.
  const start = points.findIndex((_, i) => {
    const d = ((cum[i] * scale - alongM + lap * 1.5) % lap) - lap / 2;
    const prev = ((cum[(i - 1 + n) % n] * scale - alongM + lap * 1.5) % lap) - lap / 2;
    return Math.abs(d) <= metres && !(Math.abs(prev) <= metres);
  });
  if (start <= 0) return out;
  const ordered: XY[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const d = ((cum[i] * scale - alongM + lap * 1.5) % lap) - lap / 2;
    if (Math.abs(d) > metres) break;
    ordered.push(points[i]);
  }
  return ordered;
}
