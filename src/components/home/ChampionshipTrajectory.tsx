"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { curveNatural } from "@visx/curve";
import { line } from "@visx/shape";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { computeChampionshipProgression, computeConstructorChampionshipProgression } from "@/lib/championshipProgression";
import type { RaceDoc } from "@/lib/types/race";

export type TrajectorySeries = { code: string; label: string; color: string };

const WIDTH = 520;
const HEIGHT = 120;
const PAD = 8;
// Extra room on the left/bottom edges specifically for axis tick labels - the plot area itself
// still starts/ends at these, xFor/yFor just account for the wider margins on those two sides.
const PAD_LEFT = 26;
const PAD_BOTTOM = 14;

// Bklit UI's own line chart (packages/ui/src/charts/line.tsx in github.com/bklit/bklit-ui) draws
// its curve via @visx/shape's LinePath with @visx/curve's curveNatural - a natural cubic spline
// passing exactly through every real data point (only the joins between points are curved, same
// interpolating property the previous hand-rolled Catmull-Rom formula had, just Bklit's actual
// algorithm instead of an equivalent invented here). Using the lower-level `line()` factory
// (verified against the installed @visx/shape@4's real type declarations - see D3ShapeFactories.d.ts)
// rather than the <LinePath> JSX component: this file already builds/reuses raw path-string `d`
// values imperatively (for both the stroke and the gradient-fill closing path below), which is
// exactly what `line()` returns directly - same curveNatural geometry, no restructuring needed.
const pointsLine = line<{ x: number; y: number }>({ x: (d) => d.x, y: (d) => d.y, curve: curveNatural });

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
  mode = "driver",
}: {
  races: RaceDoc[];
  series: TrajectorySeries[];
  /** A driver/team code to track cumulative points for even when it isn't itself plotted — lets
   * the tooltip show "N behind leader" for a non-leader series without drawing an extra line. Omit
   * when the only plotted series already IS the leader (a gap to itself is meaningless). */
  leaderCode?: string;
  /** "team" plots constructor points (series codes are team names, grouped via
   * computeConstructorChampionshipProgression) instead of driver points - lets YourF1's favorite
   * switcher reuse this exact component for a selected favorite TEAM's trajectory, not just a
   * driver's. Everything else (curve, gradient, tooltip, endpoint labels) is identical either way. */
  mode?: "driver" | "team";
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
  const rows = useMemo(
    () => (mode === "team" ? computeConstructorChampionshipProgression(races, codes) : computeChampionshipProgression(races, codes)),
    [races, codes, mode],
  );

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
    return { ...s, points, d: pointsLine(points) ?? "", isPrimary: si === 0 };
  });

  const hovered = hoverIndex != null ? rows[hoverIndex] : null;

  function indexFromEvent(e: { clientX: number; currentTarget: { getBoundingClientRect(): DOMRect } }): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.round(((relX - PAD) / (WIDTH - PAD * 2)) * (rows.length - 1));
    return Math.min(Math.max(i, 0), rows.length - 1);
  }

  // Tooltip/end-of-line-label edge awareness: every series' last point sits at the same rightmost
  // x by construction (xFor's own definition), so the end-of-line label ALWAYS needs to anchor to
  // the left of its dot, never grow rightward past the chart's own right edge - that was a latent
  // clipping bug regardless of container width, just far more visible once a longer label (a
  // multi-word driver/team name) made the overflow large enough to read as "cut off text" instead
  // of a barely-perceptible sliver. The interactive hover tooltip gets the same treatment,
  // computed per-hover from how close that point is to either edge.
  const hoverFrac = hoverIndex != null ? hoverIndex / (rows.length - 1) : 0.5;
  const EDGE_ZONE = 0.14;
  const tooltipAnchor = hoverFrac < EDGE_ZONE ? "left" : hoverFrac > 1 - EDGE_ZONE ? "right" : "center";
  const tooltipTranslateX = tooltipAnchor === "left" ? "0%" : tooltipAnchor === "right" ? "-100%" : "-50%";

  return (
    // A capped max-width, not just a responsive `w-full` - this component is reused in two very
    // differently-sized containers (YourF1's full-width Championship tab, SeasonRecap's half-width
    // panel); without a cap, the fixed 520:120 viewBox scales up on a very wide card until the
    // chart becomes a dominant, stretched element rather than the compact sparkline it's designed
    // to be. `mx-auto` keeps it centered rather than pinned left when the container is wider.
    <div className="mx-auto w-full max-w-[560px]">
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
         * Anchored to the LEFT of the endpoint dot (grows leftward, ends 6px before it) rather than
         * to the right - every series' last point sits at the same far-right x by construction, so
         * a rightward-growing label had nowhere to go but past the chart's own edge. Desktop-only:
         * not enough horizontal room for this alongside the chart on narrow phones. */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          {paths.map((p) => {
            const last = p.points[p.points.length - 1];
            return (
              <span
                key={`label-${p.code}`}
                className="absolute max-w-[45%] truncate text-right text-[9px] font-semibold"
                style={{ left: `${(last.x / WIDTH) * 100}%`, top: `${(last.y / HEIGHT) * 100}%`, transform: "translate(calc(-100% - 6px), -50%)", color: p.color }}
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
              // Flips to a left- or right-anchored transform once the hovered point is near either
              // edge, instead of always centering - a centered tooltip on the last/first point
              // would otherwise sit half off the chart, exactly the clipping this fixes.
              transform: `translate(${tooltipTranslateX}, -6px)`,
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
