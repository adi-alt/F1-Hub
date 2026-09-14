"use client";

import { useId } from "react";

export type SparkPoint = { round: number; points: number; cumulative: number };

type Trend = "up" | "down" | "flat";

// Semantic, but deliberately desaturated: a column of these sits inside a mostly-monochrome panel,
// and fully saturated green/red rows would turn the standings area into a colour chart.
const TREND: Record<Trend, { stroke: string; fill: string }> = {
  up: { stroke: "#34d399", fill: "rgba(52,211,153,0.16)" },
  down: { stroke: "#f87171", fill: "rgba(248,113,113,0.14)" },
  flat: { stroke: "rgba(212,212,216,0.75)", fill: "rgba(212,212,216,0.10)" },
};

/**
 * A compact trend line, in the spirit of a stock ticker's sparkline.
 *
 * It plots CUMULATIVE championship points across the recent rounds, not points-per-round. That
 * choice matters: per-round points zig-zag violently (a win then a retirement) and read as noise
 * at this size, whereas a cumulative line makes the actual shape legible - climbing steeply,
 * flattening out, or stalled.
 *
 * Slope is measured over the window rather than between the last two points, so one quiet weekend
 * doesn't flip a clearly-rising line to "down".
 */
export function Sparkline({
  series,
  label,
  width = 68,
  height = 22,
}: {
  series: SparkPoint[];
  /** Used for the accessible description. */
  label: string;
  width?: number;
  height?: number;
}) {
  const gradientId = useId();

  // Under two points there is no line to draw, and a single dot would imply a trend that hasn't
  // been measured. The row still renders, just without a chart.
  if (series.length < 2) {
    return <span className="inline-block shrink-0 opacity-40" style={{ width, height }} aria-hidden />;
  }

  const values = series.map((p) => p.cumulative);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const coords = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height - pad} L${coords[0][0].toFixed(1)},${height - pad} Z`;

  // Cumulative points can only ever rise, so "is the line going up" is not a signal - every line
  // goes up. What actually distinguishes these rows is whether the entity is ACCELERATING or
  // stalling, so the trend compares the rate across the second half of the window against the
  // first. That gives the four real shapes: climbing harder, holding, tailing off, or flat.
  const mid = Math.floor(series.length / 2);
  const rate = (from: number, to: number) => (to - from <= 0 ? 0 : (values[to] - values[from]) / (to - from));
  const earlyRate = rate(0, mid);
  const lateRate = rate(mid, values.length - 1);
  const gained = values[values.length - 1] - values[0];

  let trend: Trend;
  if (gained === 0) trend = "flat";                        // scored nothing across the window
  else if (lateRate > earlyRate * 1.25) trend = "up";      // scoring harder than they were
  else if (lateRate < earlyRate * 0.6) trend = "down";     // tailing off
  else trend = "flat";                                     // holding station
  const tone = TREND[trend];
  const [lastX, lastY] = coords[coords.length - 1];

  const roundsText = series.map((p) => `R${p.round}: ${p.points} pts`).join(", ");

  return (
    <span className="relative inline-flex shrink-0 items-center" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} points trend. ${roundsText}.`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone.fill} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={tone.stroke} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
        {/* The head of the line, so the current value reads without a label. */}
        <circle cx={lastX} cy={lastY} r="1.7" fill={tone.stroke} />
      </svg>
    </span>
  );
}
