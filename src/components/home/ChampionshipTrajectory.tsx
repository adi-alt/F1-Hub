"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { computeChampionshipProgression } from "@/lib/championshipProgression";
import type { RaceDoc } from "@/lib/types/race";

export type TrajectorySeries = { code: string; label: string; color: string };

const WIDTH = 520;
const HEIGHT = 120;
const PAD = 8;
// Extra room on the left/bottom edges specifically for axis tick labels - the plot area itself
// still starts/ends at these, xFor/yFor just account for the wider margins on those two sides.
const PAD_LEFT = 26;
const PAD_BOTTOM = 14;

/** Catmull-Rom -> cubic Bezier conversion - passes exactly through every real data point (only the
 * joins between points are curved), so this cannot distort the underlying data the way an
 * approximating spline could. A well-known, small formula - not worth a dependency for. */
function catmullRomToBezierPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** A thin, bespoke SVG points-trajectory — hand-drawn, not Recharts (no other homepage chart uses
 * this component, and no Recharts styling is borrowed), so the "at least one custom SVG data
 * visualization" requirement is genuinely a distinct visual language from Race Analysis/Session/
 * Championship/Archive/Model charts elsewhere in the app. Plots real cumulative points per
 * completed round for 2-3 real drivers (see computeChampionshipProgression — summed straight off
 * race_results, nothing simulated); answers a real question depending on which series the caller
 * passes in ("is my favorite closing the gap on the leader", "how close is the title fight").
 *
 * Redesigned for visual premium-ness, not just interactivity: a Catmull-Rom smoothed curve (exact
 * through every real point), a restrained gradient fill per line, two reference gridlines, a static
 * endpoint dot + end-of-line label per series (so the chart reads as "here's where things stand"
 * even before anyone touches it), and stroke-weight hierarchy (the primary series is visually the
 * "hero" line, a comparison/leader series is secondary) - all within the same small, readable,
 * non-neon footprint the rest of this app's charts use. */
export function ChampionshipTrajectory({
  races,
  series,
  leaderCode,
}: {
  races: RaceDoc[];
  series: TrajectorySeries[];
  /** A driver code to track cumulative points for even when it isn't itself plotted — lets the
   * tooltip show "N behind leader" for a non-leader series without drawing an extra line. Omit
   * when the only plotted series already IS the leader (a gap to itself is meaningless). */
  leaderCode?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // Separate from hoverIndex on purpose: a tap on a touch device sets both hoverIndex and pinned,
  // but a hybrid device's own continuous mousemove must not silently clear a tap-set pin the way it
  // would clear a plain hover - onMouseLeave only clears hoverIndex when nothing is pinned.
  const [pinned, setPinned] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const codes = useMemo(() => {
    const set = new Set(series.map((s) => s.code));
    if (leaderCode) set.add(leaderCode);
    return Array.from(set);
  }, [series, leaderCode]);
  const rows = useMemo(() => computeChampionshipProgression(races, codes), [races, codes]);

  if (rows.length < 2) {
    return <p className="text-sm text-neutral-500">Not enough completed races yet to plot a trajectory.</p>;
  }

  const maxPoints = Math.max(...rows.flatMap((r) => series.map((s) => Number(r[s.code] ?? 0))), 1);
  const xFor = (i: number) => PAD_LEFT + (i / (rows.length - 1)) * (WIDTH - PAD_LEFT - PAD);
  const yFor = (points: number) => HEIGHT - PAD_BOTTOM - (points / maxPoints) * (HEIGHT - PAD_BOTTOM - PAD);

  // X-axis label density: at most ~6 round labels regardless of season length, always including
  // the first and last round, so a 23-round season never overlaps labels on this small a chart.
  const xAxisStep = Math.max(1, Math.ceil(rows.length / 6));
  const xAxisIndices = Array.from(new Set([...rows.map((_, i) => i).filter((i) => i % xAxisStep === 0), rows.length - 1])).sort((a, b) => a - b);

  const paths = series.map((s, si) => {
    const points = rows.map((r, i) => ({ x: xFor(i), y: yFor(Number(r[s.code] ?? 0)) }));
    return { ...s, points, d: catmullRomToBezierPath(points), isPrimary: si === 0 };
  });

  const hovered = hoverIndex != null ? rows[hoverIndex] : null;

  function indexFromEvent(e: { clientX: number; currentTarget: { getBoundingClientRect(): DOMRect } }): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.round(((relX - PAD) / (WIDTH - PAD * 2)) * (rows.length - 1));
    return Math.min(Math.max(i, 0), rows.length - 1);
  }

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full cursor-pointer"
          onMouseLeave={() => {
            if (!pinned) setHoverIndex(null);
          }}
          onMouseMove={(e) => {
            if (pinned) return;
            setHoverIndex(indexFromEvent(e));
          }}
          onClick={(e) => {
            const i = indexFromEvent(e);
            // A second tap/click on the already-pinned point unpins it (touch devices have no
            // hover to fall back to, so this is the only way to dismiss the tooltip).
            if (pinned && hoverIndex === i) {
              setPinned(false);
              setHoverIndex(null);
              return;
            }
            setHoverIndex(i);
            setPinned(true);
          }}
        >
          <defs>
            {paths.map((p) => (
              <linearGradient key={`grad-${p.code}`} id={`trajectory-gradient-${p.code}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={p.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* Two light reference gridlines - not a dense grid, just enough to judge scale. */}
          <line x1={PAD_LEFT} x2={WIDTH - PAD} y1={yFor(maxPoints)} y2={yFor(maxPoints)} stroke={chart.gridline} strokeWidth={1} />
          <line x1={PAD_LEFT} x2={WIDTH - PAD} y1={yFor(maxPoints / 2)} y2={yFor(maxPoints / 2)} stroke={chart.gridline} strokeWidth={1} />

          {/* Y-axis: 3 real values from the actual dataset (0/half/max) - a 0 baseline is correct
           * here (not misleading) since this is a cumulative points chart, not a zoomed price
           * chart. X-axis: round numbers at a thinned-out subset so a long season never overlaps. */}
          <text x={PAD_LEFT - 6} y={yFor(0)} textAnchor="end" dominantBaseline="middle" fontSize={8} fill={chart.mutedInk}>
            0
          </text>
          <text x={PAD_LEFT - 6} y={yFor(maxPoints / 2)} textAnchor="end" dominantBaseline="middle" fontSize={8} fill={chart.mutedInk}>
            {Math.round(maxPoints / 2)}
          </text>
          <text x={PAD_LEFT - 6} y={yFor(maxPoints)} textAnchor="end" dominantBaseline="middle" fontSize={8} fill={chart.mutedInk}>
            {maxPoints}
          </text>
          {xAxisIndices.map((i) => (
            <text key={`xlabel-${i}`} x={xFor(i)} y={HEIGHT - 2} textAnchor="middle" fontSize={8} fill={chart.mutedInk}>
              R{rows[i].round}
            </text>
          ))}

          {paths.map((p) => (
            <path
              key={`fill-${p.code}`}
              d={`${p.d} L ${xFor(rows.length - 1)} ${HEIGHT - PAD} L ${xFor(0)} ${HEIGHT - PAD} Z`}
              fill={`url(#trajectory-gradient-${p.code})`}
              stroke="none"
            />
          ))}

          {paths.map((p, i) => (
            <motion.path
              key={p.code}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.isPrimary ? 2 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={prefersReducedMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: "easeOut", delay: i * 0.1 }}
            />
          ))}

          {/* Endpoint emphasis - static, not hover-only, so the chart visually anchors "where
           * things stand now" at rest. */}
          {paths.map((p) => {
            const last = p.points[p.points.length - 1];
            return <circle key={`end-${p.code}`} cx={last.x} cy={last.y} r={3.5} fill={p.color} stroke="var(--f1-carbon)" strokeWidth={1.5} />;
          })}

          {hoverIndex != null && (
            <>
              <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={PAD} y2={HEIGHT - PAD_BOTTOM} stroke="var(--f1-line)" strokeWidth={1} />
              {paths.map((p) => (
                <circle key={p.code} cx={xFor(hoverIndex)} cy={yFor(Number(rows[hoverIndex][p.code] ?? 0))} r={3} fill={p.color} />
              ))}
            </>
          )}
        </svg>

        {/* End-of-line labels - a small "editorial chart" signature (driver + current points right
         * on the line) so which line is which doesn't require cross-referencing the legend below.
         * Desktop-only: not enough horizontal room for this alongside the chart on narrow phones. */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          {paths.map((p) => {
            const last = p.points[p.points.length - 1];
            return (
              <span
                key={`label-${p.code}`}
                className="absolute whitespace-nowrap text-[9px] font-semibold"
                style={{ left: `${(last.x / WIDTH) * 100}%`, top: `${(last.y / HEIGHT) * 100}%`, transform: "translate(6px, -50%)", color: p.color }}
              >
                {p.label} · {rows[rows.length - 1][p.code]}
              </span>
            );
          })}
        </div>

        {hovered && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-y-full rounded-lg border px-2.5 py-1.5 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
            style={{
              left: `${(xFor(hoverIndex!) / WIDTH) * 100}%`,
              transform: "translate(-50%, -6px)",
              background: tooltipStyle.background,
              backdropFilter: tooltipStyle.backdropFilter,
              WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter,
              borderColor: "var(--tooltip-border)",
            }}
          >
            <p className="whitespace-nowrap font-semibold text-white">
              Round {hovered.round}: {hovered.raceName}
            </p>
            <p className="whitespace-nowrap text-[10px] text-neutral-500">{hovered.trackShort as string}</p>
            {series.map((s) => {
              const points = Number(hovered[s.code] ?? 0);
              const finishPosition = hovered[`${s.code}__finishPosition`];
              const gap = leaderCode && s.code !== leaderCode ? Number(hovered[leaderCode] ?? 0) - points : null;
              return (
                <p key={s.code} className="whitespace-nowrap text-neutral-400">
                  <span className="mr-1 font-medium" style={{ color: s.color }}>
                    {s.label}
                  </span>
                  {points} pts
                  {finishPosition != null && <> · P{finishPosition as number}</>}
                  {gap != null && <> · {gap >= 0 ? `${gap} behind leader` : `${Math.abs(gap)} ahead`}</>}
                </p>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-neutral-500">
        {series.map((s) => (
          <span key={s.code} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
