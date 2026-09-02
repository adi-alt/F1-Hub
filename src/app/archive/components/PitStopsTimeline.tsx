"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { chart, sessionChartHeight, tooltipStyle } from "@/components/charts/chartTheme";
import { teamColor } from "@/lib/teamColors";
import type { ArchivePitStopEntry, ArchiveResultEntry } from "@/lib/supabase/archive";
import { filterDriverSet, type DriverSet } from "@/lib/driverSet";

type Point = { driverName: string; lap: number; durationSec: number | null; color: string; order: number };

// Longer stops get a visibly bigger dot — clamped so one freak 60s stop-and-retire doesn't make
// every normal ~2.5s stop invisible by comparison.
function radiusFor(durationSec: number | null): number {
  if (durationSec === null) return 5;
  return Math.min(14, Math.max(5, durationSec / 2));
}

function Dot({
  cx,
  cy,
  payload,
  hovered,
  onHover,
  onLeave,
}: {
  cx?: number;
  cy?: number;
  payload?: Point;
  hovered: string | null;
  onHover: (driverName: string) => void;
  onLeave: () => void;
}) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const dimmed = hovered !== null && hovered !== payload.driverName;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radiusFor(payload.durationSec)}
      fill={payload.color}
      fillOpacity={dimmed ? 0.25 : 0.85}
      style={{ transition: "fill-opacity 150ms ease-out" }}
      onMouseEnter={() => onHover(payload.driverName)}
      onMouseLeave={onLeave}
    />
  );
}

/** Same dark/blurred/bordered tooltip shape every chart on this page uses (QualifyingTooltip,
 * LapTooltip) - this one previously relied on Recharts' own default tooltip layout via
 * `contentStyle` alone, which styles the outer box but not the internal label/value text color,
 * leaving it at Recharts' own default (dark-on-dark, effectively unreadable). */
function PitStopTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Point;
  return (
    <div
      className="rounded-[10px] border px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
      style={{ background: tooltipStyle.background, backdropFilter: tooltipStyle.backdropFilter, WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter, borderColor: "var(--tooltip-border)" }}
    >
      <p className="text-sm font-semibold text-white">{d.driverName}</p>
      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-neutral-500">Lap</p>
      <p className="font-mono text-sm text-white">{d.lap}</p>
      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-neutral-500">Duration</p>
      <p className="font-mono text-sm text-white">{d.durationSec !== null ? `${d.durationSec.toFixed(3)}s` : "–"}</p>
    </div>
  );
}

// Shows *when* the field stopped and roughly how long, at a glance — lap on the x-axis, one row
// per driver (ordered by finishing position) on the y-axis, dot size scaled to stop duration.
// Hovering a driver's row highlights every stop of theirs and fades the rest of the field.
export function PitStopsTimeline({
  pitStops,
  results,
  driverSet,
  customIds,
}: {
  pitStops: ArchivePitStopEntry[];
  results: ArchiveResultEntry[];
  // The shared Top 5/10/All/Custom filter (lifted to ArchiveRaceDashboard, driving every Race
  // Analysis panel together) - own ordering (finishing position, unchanged), sliced/filtered to
  // the shared selection.
  driverSet: DriverSet;
  customIds: string[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const nameFor = (driverId: string) => results.find((r) => r.driverId === driverId)?.driverName ?? driverId;
  const colorFor = (driverId: string) => {
    const constructor = results.find((r) => r.driverId === driverId)?.constructor;
    return constructor ? teamColor(constructor) : chart.mutedInk;
  };

  // Memoized on the real inputs (results/pitStops/driverSet/customIds) only - not on `hovered`.
  // These used to be plain computations re-run on every render, which includes every
  // hover-triggered re-render (setHovered fires on every dot mouseenter/mouseleave) - a fresh
  // `data` array (new object references) on every one of those was handed straight to Recharts'
  // `data` prop, which is what made the chart visibly re-render on hover instead of just updating
  // one dot's fillOpacity.
  const driverOrder = useMemo(() => {
    const rankedIds = results.map((r) => r.driverId).filter((id) => pitStops.some((p) => p.driverId === id));
    return filterDriverSet(rankedIds, driverSet, (id) => id, customIds);
  }, [results, pitStops, driverSet, customIds]);

  // Recharts derives a category axis's row order from first-appearance in `data`, not from
  // alphabetical or any other implicit rule — sorting by finishing position here (rather than
  // pit-stop order, which is what this produced before the fix) is what makes the chart read as
  // an ordered comparison instead of a seemingly-random diagonal scatter.
  const data: Point[] = useMemo(() => {
    const visible = new Set(driverOrder);
    return pitStops
      .filter((p) => visible.has(p.driverId))
      .map((p) => ({
        driverName: nameFor(p.driverId),
        lap: p.lap,
        durationSec: p.durationSec,
        color: colorFor(p.driverId),
        order: driverOrder.indexOf(p.driverId),
      }))
      .sort((a, b) => a.order - b.order);
  }, [pitStops, driverOrder]); // eslint-disable-line react-hooks/exhaustive-deps -- nameFor/colorFor are derived from the same `results` prop each render, not their own changing input

  return (
    <div>
      {/* `layout` - height is content-driven (sessionChartHeight), so switching Top 5 -> All drivers
          animates the chart smoothly taller/shorter instead of the height snapping instantly
          under the still-animating entrance transition. */}
      <motion.div layout initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
        <ResponsiveContainer width="100%" height={sessionChartHeight(driverOrder.length)}>
        <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 24 }}>
          <XAxis
            type="number"
            dataKey="lap"
            name="Lap"
            tick={{ fill: chart.mutedInk, fontSize: 12 }}
            axisLine={{ stroke: chart.gridline }}
            tickLine={false}
            label={{ value: "Lap", position: "insideBottom", offset: -16, fill: chart.mutedInk, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="driverName"
            name="Driver"
            width={140}
            tick={{ fill: "#c3c2b7", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={false} content={PitStopTooltip} />
          <Scatter data={data} shape={<Dot hovered={hovered} onHover={setHovered} onLeave={() => setHovered(null)} />} />
        </ScatterChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
