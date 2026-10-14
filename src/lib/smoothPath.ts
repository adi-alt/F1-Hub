// Smooth lines for charts drawn by hand (sparklines, the landing's career arc), the same shape recharts draws with
// type="monotone": a cubic through every point whose tangents are limited (Fritsch–Carlson, as d3's curveMonotoneX),
// so the curve never overshoots the data: a cumulative points line can't dip between two rising points, and a peak
// stays where it is.

export type XY = readonly [number, number];

/** The tangent at each point, limited so no segment overshoots its two ends. Points must be in increasing x. */
function tangents(points: readonly XY[]): number[] {
  const n = points.length;
  const slope = (i: number) => (points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0] || 1);
  const t = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope(i - 1);
    const s1 = slope(i);
    const h0 = points[i][0] - points[i - 1][0];
    const h1 = points[i + 1][0] - points[i][0];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1);
    t[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  // Each end: the slope a parabola through it and its neighbour would have.
  if (n > 1) {
    t[0] = n > 2 ? (3 * slope(0) - t[1]) / 2 : slope(0);
    t[n - 1] = n > 2 ? (3 * slope(n - 2) - t[n - 2]) / 2 : slope(n - 2);
  }
  return t;
}

const f = (v: number) => (Math.round(v * 100) / 100).toString();

/** An open path ("M … C …") through the points, smooth and without overshoot. Fewer than two points: a move only. */
export function smoothOpenPath(points: readonly XY[]): string {
  if (points.length === 0) return "";
  const [x0, y0] = points[0];
  if (points.length === 1) return `M${f(x0)},${f(y0)}`;
  const t = tangents(points);
  let d = `M${f(x0)},${f(y0)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [xa, ya] = points[i];
    const [xb, yb] = points[i + 1];
    const dx = (xb - xa) / 3;
    d += ` C${f(xa + dx)},${f(ya + dx * t[i])} ${f(xb - dx)},${f(yb - dx * t[i + 1])} ${f(xb)},${f(yb)}`;
  }
  return d;
}

/** The same curve closed down to a baseline, for the soft fill under a line. */
export function smoothAreaPath(points: readonly XY[], baseline: number): string {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${smoothOpenPath(points)} L${f(last[0])},${f(baseline)} L${f(first[0])},${f(baseline)} Z`;
}
