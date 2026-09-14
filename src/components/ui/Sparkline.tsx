"use client";

import { useId } from "react";

export type SparkPoint = { round: number; points: number; cumulative: number };

export type Trend = "up" | "down" | "flat";

/**
 * Classify a cumulative series as accelerating, holding, or tailing off.
 *
 * Direction is NOT the signal here. Cumulative championship points can only ever rise, so "is the
 * line going up" is true for every entity that has scored at all, and colouring by it would paint
 * the whole column green. What distinguishes these rows is whether the rate is increasing: the
 * scoring rate across the back half of the window is compared against the front half.
 *
 * Exported and pure so the thresholds are testable rather than asserted by eye.
 */
export function sparklineTrend(values: number[]): Trend {
  if (values.length < 2) return "flat";
  const gained = values[values.length - 1] - values[0];
  if (gained === 0) return "flat"; // scored nothing across the window

  const mid = Math.floor(values.length / 2);
  const rate = (from: number, to: number) => (to - from <= 0 ? 0 : (values[to] - values[from]) / (to - from));
  const earlyRate = rate(0, mid);
  const lateRate = rate(mid, values.length - 1);

  // A window that only started scoring late is accelerating by definition; guarding the zero case
  // explicitly avoids treating "0 -> something" as a ratio against zero.
  if (earlyRate === 0) return "up";
  if (lateRate > earlyRate * 1.25) return "up";
  if (lateRate < earlyRate * 0.6) return "down";
  return "flat";
}

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

  const tone = TREND[sparklineTrend(values)];
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
