// Deterministic, stylized circuit-shape generation.
//
// This app has no real surveyed track geometry anywhere in its data layer (nothing in
// supabase/schema.sql, nothing the pipeline writes) - building 20+ pixel-accurate real-world
// circuit outlines would mean scraping external vector data of uneven, unverifiable quality for
// every venue, with no way to visually confirm any of them render correctly. Faking survey
// accuracy would be a worse failure than not having it: a wrong track shape mislabels a real
// place. This generates an honest, clearly SCHEMATIC closed-loop path instead - every consumer
// labels it as a stylized layout, never as a to-scale map - shaped by the circuit's own real
// characteristics (turn count, street vs. permanent) so it's still visually distinct per circuit
// and not a repeated generic ring, and fully deterministic (same seed -> same shape every render,
// every reload) via a seeded PRNG rather than Math.random.

import type { TrackType } from "./circuitFacts";
import circuitShapesData from "./circuitShapes.json";

type CircuitShapeEntry = { path: string; viewBox?: string };
type CircuitShapesFile = { metadata?: unknown; shapes: Record<string, CircuitShapeEntry> };
const circuitShapes = circuitShapesData as CircuitShapesFile;

// Pure, tiny, dependency-free PRNG (mulberry32) - deterministic across server and client renders
// from the same string seed, which Math.random() can never be (and which pulling in a package for
// one 5-line function would be a strange trade).
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TrackPoint = { x: number; y: number };
export type TurnMarker = TrackPoint & { number: number };

export type TrackShape = {
  /** A closed SVG path `d` string */
  path: string;
  /** The SVG viewBox for this path */
  viewBox: string;
  /** Positions for numbered turn markers (schematic fallback only, real SVG geometry omits these) */
  turns: TurnMarker[];
  /** The start/finish point */
  startFinish: TrackPoint;
  /** Whether this is authentic geometry or a schematic fallback */
  isAuthentic: boolean;
};

/** Returns authentic SVG geometry if available in the ingested dataset, otherwise falls back to a 
 * deterministic schematic loop shaped by the circuit's own real characteristics. */
export function generateTrackShape(seed: string, turns: number, trackType: TrackType): TrackShape {
  const normalizedId = seed.toLowerCase();
  const shapesData = circuitShapes.shapes;
  const data = shapesData[normalizedId];

  if (data) {
    // Extract first coordinate as an approximation of start/finish for the authentic SVGs
    const m = data.path.match(/M\s*([0-9.-]+)[, ]([0-9.-]+)/);
    const startFinish = m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 };
    return {
      path: data.path,
      viewBox: data.viewBox || "0 0 1000 1000",
      turns: [], // Authentic maps don't have evenly spaced procedural turns
      startFinish,
      isAuthentic: true,
    };
  }

  const rand = seededRandom(`${seed}:${turns}:${trackType}`);
  const pointCount = Math.max(8, Math.min(22, turns));
  const cx = 50;
  const cy = 50;
  const baseRadiusX = trackType === "street" ? 32 : 38;
  const baseRadiusY = trackType === "street" ? 30 : 34;
  // Street circuits jitter harder (tighter, more irregular corners); permanent circuits stay
  // closer to a smooth ellipse (long, flowing layouts).
  const jitter = trackType === "street" ? 0.32 : 0.16;

  const ring: TrackPoint[] = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const rx = baseRadiusX * (1 - jitter / 2 + rand() * jitter);
    const ry = baseRadiusY * (1 - jitter / 2 + rand() * jitter);
    ring.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }

  // Catmull-Rom -> cubic Bezier conversion for a smooth CLOSED loop through every ring point -
  // straight point-to-point lines would look like a polygon, not a track.
  const path = catmullRomClosed(ring);

  const turnMarkers: TurnMarker[] = ring.slice(0, Math.min(turns, ring.length)).map((p, i) => ({ ...p, number: i + 1 }));

  return { path, viewBox: "0 0 100 100", turns: turnMarkers, startFinish: ring[0], isAuthentic: false };
}

function catmullRomClosed(points: TrackPoint[]): string {
  const n = points.length;
  if (n < 3) return "";
  const at = (i: number) => points[((i % n) + n) % n];
  let d = `M ${at(0).x.toFixed(2)},${at(0).y.toFixed(2)} `;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} `;
  }
  return `${d}Z`;
}
