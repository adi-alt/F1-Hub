"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { CurveFactory, CurveGenerator } from "victory-vendor/d3-shape";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { Skeleton } from "@/components/ui/Skeleton";
import { filterDriverSet, type DriverSet } from "@/lib/driverSet";

export type LapTiming = { driverId: string; time: string | null; position: number | null };
export type LapEntry = { lap: number; timings: LapTiming[] };
export type LapChartResultEntry = { driverId: string; driverName: string; position: number };

const CORNER_RADIUS = 5;

/** A genuine step generator (stepAfter's own shape - hold position for the whole lap, then jump at
 * the lap boundary, semantically correct for discrete position data - "do NOT use a smooth spline,
 * it suggests continuous movement"), but with both corners of each step rounded via a small
 * quadratic curve instead of d3-shape's own sharp `curveStepAfter`. This is the standard Recharts
 * extension point for a custom interpolation (`type` accepts a d3-shape `CurveFactory`, not just
 * the named presets - see Line.d.ts/Curve.d.ts), not a hand-rolled path/scale reimplementation.
 *
 * Laps only ever increase left-to-right, which is what makes rounding BOTH corners of a step
 * tractable without true multi-point lookahead: every corner's outgoing direction is always
 * "rightward," so each `point()` call can immediately round the corner it just arrived at (using
 * only the previous point, already known) - no buffering needed, except for one accepted edge case
 * documented below. */
function curveRoundedStepAfter(radius: number): CurveFactory {
  return (context): CurveGenerator => {
    let x: number | null = null;
    let y: number | null = null;
    let point = 0;
    return {
      areaStart() {},
      areaEnd() {},
      lineStart() {
        point = 0;
      },
      lineEnd() {},
      point(px: number, py: number) {
        const nx = +px;
        const ny = +py;
        if (point === 0) {
          context.moveTo(nx, ny);
          point = 1;
        } else if (ny === y) {
          context.lineTo(nx, ny);
        } else {
          const dirY = ny > y! ? 1 : -1;
          const r = Math.min(radius, Math.abs(nx - x!) / 2, Math.abs(ny - y!) / 2);
          context.lineTo(nx - r, y!);
          context.quadraticCurveTo(nx, y!, nx, y! + dirY * r);
          context.lineTo(nx, ny - dirY * r);
          context.quadraticCurveTo(nx, ny, nx + r, ny);
          // ponytail: this rounds the "departure" corner by drawing `r` px past the true lap x,
          // betting a later point continues rightward from there - true for every corner except
          // the very last point in the series, which overshoots by up to `radius` px past the
          // final lap with nothing drawn beyond it. d3-path's Path has no way to retract an
          // already-appended command to fix this after the fact; the overshoot is small, bounded,
          // and only ever visible at the line's own right end, not worth a second rendering pass.
        }
        x = nx;
        y = ny;
      },
    };
  };
}

/** Shaped like the final chart (axis + plot area + legend pills), not a generic rectangle - the
 * lap fetch (~1,300 rows/race) is genuine async work, unlike the rest of the race page. */
function LapChartSkeleton() {
  return (
    <div>
      <Skeleton className="skeleton-shimmer h-[320px] w-full" />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="skeleton-shimmer h-6 w-24 rounded-md" />
        ))}
      </div>
    </div>
  );
}

// The shared chartTheme only defines a couple of data colors (built for single/dual-series
// charts like CircuitTrendChart) - a full grid's worth of drivers needs one distinct color each,
// so this generates an evenly-spaced hue rotation instead of trying to stretch a 2-color palette
// across ~20 lines.
function driverColor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 65%, 60%)`;
}

type Moment = { lap: number; text: string };

/** Every lead change (the P1 driver changing lap over lap - unambiguous) plus the single biggest
 * one-lap position gain across the whole field - genuinely derivable from real lap-by-lap position
 * data, nothing invented. Capped so this stays a handful of real highlights, not a lap-by-lap
 * transcript. */
function computeMoments(laps: LapEntry[], nameFor: (id: string) => string): Moment[] {
  const moments: Moment[] = [];
  let prevLeader: string | null = null;
  let biggestGain: { lap: number; driverId: string; gained: number } | null = null;
  let prevPositions = new Map<string, number>();

  for (const entry of laps) {
    const leader = entry.timings.find((t) => t.position === 1)?.driverId ?? null;
    if (leader && prevLeader && leader !== prevLeader) {
      moments.push({ lap: entry.lap, text: `${nameFor(leader)} took the lead.` });
    }
    if (leader) prevLeader = leader;

    for (const t of entry.timings) {
      if (t.position === null) continue;
      const prev = prevPositions.get(t.driverId);
      if (prev !== undefined) {
        const gained = prev - t.position;
        if (gained > 0 && (!biggestGain || gained > biggestGain.gained)) {
          biggestGain = { lap: entry.lap, driverId: t.driverId, gained };
        }
      }
    }
    prevPositions = new Map(entry.timings.filter((t) => t.position !== null).map((t) => [t.driverId, t.position!]));
  }

  if (biggestGain && biggestGain.gained >= 2) {
    moments.push({ lap: biggestGain.lap, text: `${nameFor(biggestGain.driverId)} gained ${biggestGain.gained} places in a single lap.` });
  }

  return moments.sort((a, b) => a.lap - b.lap).slice(0, 6);
}

/** Small dot at a driver's first plotted lap, a bigger filled one at their last - "do not show a
 * marker at every lap," per Recharts' own `dot` render-prop convention (called once per point;
 * returning null skips it entirely for every lap that's neither). */
function makeEndpointDot(firstLap: number, lastLap: number, color: string, isHighlighted: boolean) {
  return function EndpointDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: { lap: number } }) {
    if (cx === undefined || cy === undefined || !payload) return null;
    if (payload.lap === lastLap) {
      return <circle cx={cx} cy={cy} r={isHighlighted ? 4.5 : 3.5} fill={color} opacity={isHighlighted ? 1 : 0.85} />;
    }
    if (payload.lap === firstLap) {
      return <circle cx={cx} cy={cy} r={2.5} fill="var(--f1-carbon)" stroke={color} strokeWidth={1.5} opacity={isHighlighted ? 1 : 0.85} />;
    }
    return null;
  };
}

/** Shared by Season and Archive's race pages - each side owns its own fetch (different table,
 * different API route: race_laps/useSeasonLaps vs archive_laps/useArchiveLaps) and passes the
 * result down as plain props. `driverSet`/`customIds` come from the section's one shared filter
 * (lifted to the dashboard) - this no longer owns its own separate Top5/10/All/Custom control. */
export function LapChart({
  laps,
  isLoading,
  isError,
  results,
  driverSet,
  customIds,
}: {
  laps: LapEntry[] | undefined;
  isLoading: boolean;
  isError: boolean;
  results: LapChartResultEntry[];
  driverSet: DriverSet;
  customIds: string[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);

  const nameFor = (driverId: string) => results.find((r) => r.driverId === driverId)?.driverName ?? driverId;
  const highlighted = locked ?? hovered;

  const driverIds = useMemo(() => {
    const ids = new Set<string>();
    for (const lap of laps ?? []) for (const t of lap.timings) ids.add(t.driverId);
    // Order by real final race position (not however `results` happened to arrive) so the
    // legend/line-color order - and the Top 5/Top 10 slice below - matches the results table.
    return [...results]
      .filter((r) => ids.has(r.driverId))
      .sort((a, b) => a.position - b.position)
      .map((r) => r.driverId);
  }, [laps, results]);

  const visibleDriverIds = useMemo(() => filterDriverSet(driverIds, driverSet, (id) => id, customIds), [driverIds, driverSet, customIds]);
  // The currently-highlighted trajectory renders last (on top) - SVG has no z-index for siblings,
  // paint order is DOM order, so "bring the active line forward" means moving it to the end of
  // the list actually being mapped over, not a style change.
  const orderedDriverIds = useMemo(
    () => (highlighted ? [...visibleDriverIds.filter((id) => id !== highlighted), highlighted] : visibleDriverIds),
    [visibleDriverIds, highlighted],
  );

  const chartData = useMemo(
    () =>
      (laps ?? []).map((lap) => {
        const row: Record<string, number | null> & { lap: number } = { lap: lap.lap };
        for (const t of lap.timings) row[t.driverId] = t.position;
        return row;
      }),
    [laps],
  );

  // First/last lap this driver actually has a real (non-null) position for - endpoint dots land
  // exactly there, not lap 1/lap N of the race, for a driver who joined late or retired early.
  const endpointLaps = useMemo(() => {
    const out = new Map<string, { first: number; last: number }>();
    for (const row of chartData) {
      for (const id of driverIds) {
        if (row[id] == null) continue;
        const existing = out.get(id);
        if (!existing) out.set(id, { first: row.lap, last: row.lap });
        else existing.last = row.lap;
      }
    }
    return out;
  }, [chartData, driverIds]);

  const moments = useMemo(() => (laps ? computeMoments(laps, nameFor) : []), [laps]); // eslint-disable-line react-hooks/exhaustive-deps -- nameFor is derived from the same `results` prop each render, not its own changing input

  if (isLoading) return <LapChartSkeleton />;
  if (isError || chartData.length === 0) {
    return <p className="text-sm text-neutral-500">No lap data available for this race.</p>;
  }

  // Dark, blurred, single-driver-focused tooltip - Recharts' own multi-series LineChart tooltip
  // shows every active line's value at the hovered lap by default (a 20-row wall of numbers); this
  // shows only whichever driver is actually highlighted (hover or lock), matching "hovering a
  // trajectory" as a single-driver interaction, not "hovering the chart." Nested here (not a
  // module-level component like QualifyingTooltip) because it needs closure over `highlighted`/
  // `chartData`/`nameFor`, none of which Recharts itself would pass as props.
  function LapTooltip({ active, payload, label }: TooltipContentProps) {
    if (!active || !payload?.length || !highlighted) return null;
    const point = payload.find((p) => p.dataKey === highlighted);
    const position = point?.value;
    if (position == null) return null;
    const lap = Number(label);
    const prevRow = chartData.find((r) => r.lap === lap - 1);
    const prevPosition = prevRow?.[highlighted] ?? null;
    const delta = prevPosition != null ? prevPosition - Number(position) : null;
    return (
      <div
        className="rounded-[10px] border px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
        style={{ background: tooltipStyle.background, backdropFilter: tooltipStyle.backdropFilter, WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter, borderColor: "var(--tooltip-border)" }}
      >
        <p className="text-sm font-semibold text-white">{nameFor(highlighted)}</p>
        <p className="mt-1.5 text-[10px] uppercase tracking-wide text-neutral-500">Lap {lap}</p>
        <p className="font-mono text-sm text-white">Position: P{position}</p>
        {prevPosition != null && <p className="font-mono text-xs text-neutral-500">Previous lap: P{prevPosition}</p>}
        {delta !== null && delta !== 0 && (
          <p className="mt-1 font-mono text-xs font-semibold" style={{ color: delta > 0 ? chart.sequentialGreen : chart.divergingRed }}>
            {delta > 0 ? `▲ Gained ${delta} position${delta === 1 ? "" : "s"}` : `▼ Lost ${-delta} position${delta === -1 ? "" : "s"}`}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* A driver's default state is deliberately quiet (every line the same modest weight) -
          hovering (either the legend pill or the trajectory itself, or clicking to lock it while
          the mouse moves to the chart) picks one out and fades the rest, rather than ~20
          equally-loud lines competing for attention. */}
      <motion.div layout initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ left: 8, right: 16, top: 8 }}>
            {/* Two separate grids, not one - horizontal position guides read a touch more visibly
                than the vertical lap guides, matching "light horizontal... very subtle vertical." */}
            <CartesianGrid horizontal vertical={false} stroke={chart.gridline} strokeOpacity={0.6} />
            <CartesianGrid horizontal={false} vertical stroke={chart.gridline} strokeOpacity={0.25} />
            <XAxis
              dataKey="lap"
              tick={{ fill: chart.mutedInk, fontSize: 12 }}
              axisLine={{ stroke: chart.gridline }}
              tickLine={false}
              label={{ value: "Lap", position: "insideBottom", offset: -4, fill: chart.mutedInk, fontSize: 12 }}
            />
            <YAxis
              reversed
              allowDecimals={false}
              tick={{ fill: chart.mutedInk, fontSize: 12 }}
              axisLine={{ stroke: chart.gridline }}
              tickLine={false}
              width={32}
              label={{ value: "Position", angle: -90, position: "insideLeft", fill: chart.mutedInk, fontSize: 12 }}
            />
            <Tooltip cursor={{ stroke: "rgba(255,255,255,0.15)", strokeDasharray: "3 3" }} content={LapTooltip} />
            {orderedDriverIds.map((driverId) => {
              const isHighlighted = highlighted === null || highlighted === driverId;
              // Color is keyed off the full grid's index, not the visible subset's - so a
              // driver's line color stays the same one when switching Top 5 -> All, not reshuffled.
              const colorIndex = driverIds.indexOf(driverId);
              const color = driverColor(colorIndex, driverIds.length);
              const endpoints = endpointLaps.get(driverId);
              return (
                <Line
                  key={driverId}
                  type={curveRoundedStepAfter(CORNER_RADIUS)}
                  dataKey={driverId}
                  name={nameFor(driverId)}
                  stroke={color}
                  strokeWidth={highlighted === driverId ? 2.5 : 1.5}
                  strokeOpacity={isHighlighted ? 1 : 0.15}
                  strokeLinecap="round"
                  dot={endpoints ? makeEndpointDot(endpoints.first, endpoints.last, color, highlighted === driverId) : false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                  onMouseEnter={() => setHovered(driverId)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setLocked((prev) => (prev === driverId ? null : driverId))}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {visibleDriverIds.map((driverId) => {
          const isActive = highlighted === driverId;
          const colorIndex = driverIds.indexOf(driverId);
          return (
            <button
              key={driverId}
              type="button"
              onMouseEnter={() => setHovered(driverId)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setLocked((prev) => (prev === driverId ? null : driverId))}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
                isActive ? "border-white/25 bg-white/[0.06] text-white" : "border-transparent text-neutral-400 hover:text-white"
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: driverColor(colorIndex, driverIds.length) }} />
              {nameFor(driverId)}
            </button>
          );
        })}
      </div>

      {moments.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Key race moments</p>
          <ul className="space-y-1.5">
            {moments.map((m, i) => (
              <li key={i} className="flex gap-2 text-sm text-neutral-300">
                <span className="w-12 shrink-0 font-mono text-xs text-neutral-500">Lap {m.lap}</span>
                {m.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
