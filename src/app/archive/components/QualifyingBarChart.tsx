"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps, type TooltipContentProps } from "recharts";
import { chart, sessionChartHeight, tooltipStyle } from "@/components/charts/chartTheme";
import { parseTimeToSeconds } from "@/lib/parseTimeToSeconds";
import { teamColor } from "@/lib/teamColors";
import type { ArchiveQualifyingEntry } from "@/lib/supabase/archive";
import type { DriverSet } from "@/lib/driverSet";

type BarDatum = { driverName: string; gap: number; time: string | null; color: string };

/** Recharts' default Tooltip draws a full-category-width cursor rectangle behind whatever's
 * hovered - for a vertical BarChart that's the entire row, not the bar, and it renders as a flat
 * gray/white fill with no way to theme it into the dashboard's own dark surfaces. `cursor={false}`
 * on the Tooltip (below) turns that off entirely; the bar's own hover state (already handled by
 * Cell's fillOpacity) is the only highlight that should exist. This custom `content` replaces
 * Recharts' own tooltip layout (a plain label + formatted value list) with the actual visual
 * hierarchy asked for - driver name as the header, then a muted label, then the real value. */
function QualifyingTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as BarDatum;
  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-xl"
      style={{ background: tooltipStyle.background, backdropFilter: tooltipStyle.backdropFilter, WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter, borderColor: "var(--tooltip-border)" }}
    >
      <p className="text-sm font-semibold text-white">{d.driverName}</p>
      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-neutral-500">Gap to pole</p>
      <p className="font-mono text-sm text-white">{d.gap === 0 ? "Pole" : `+${d.gap.toFixed(3)}s`}</p>
      {d.time && <p className="mt-1 text-xs text-neutral-500">{d.time}</p>}
    </div>
  );
}

/** Bar geometry animates in once (width 0 -> real value, staggered per driver) via a custom
 * `shape` - Recharts merges the sibling `<Cell>`'s fill/fillOpacity/hover handlers into these same
 * props, so this only needs to override how the rectangle itself is drawn, not re-derive any of
 * that. Width, not scaleX - these are SVG rects Recharts has already positioned at a shared left
 * edge (the 0s gridline), so animating the geometry attribute directly is simpler and more
 * reliable here than a CSS transform, which would need its own transform-origin bookkeeping for
 * no real benefit. fillOpacity (the hover dim/undim) stays a plain attribute + CSS transition, not
 * part of the framer animation - it needs to react instantly on every hover change, not just once
 * on first scroll-into-view.
 *
 * Renders a plain <rect>, not Recharts' own default <path>-based Rectangle - visually identical,
 * but a real SVG rect has a native `width` attribute framer-motion can animate directly, which a
 * path's `d` string doesn't. Recharts' own BarShapeProps types onMouseEnter/Leave for the
 * SVGPathElement it normally renders; the cast below is just bridging that mismatch (both are
 * plain "some SVG element" mouse events - nothing element-specific is ever read off them). */
function AnimatedBar({ x = 0, y = 0, width = 0, height = 0, fill, fillOpacity, index = 0, onMouseEnter, onMouseLeave }: BarShapeProps) {
  return (
    <motion.rect
      x={x}
      y={y}
      height={height}
      rx={3}
      ry={3}
      fill={fill}
      fillOpacity={fillOpacity}
      initial={{ width: 0 }}
      whileInView={{ width }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={onMouseEnter as unknown as React.MouseEventHandler<SVGRectElement>}
      onMouseLeave={onMouseLeave as unknown as React.MouseEventHandler<SVGRectElement>}
      style={{ transition: "fill-opacity 150ms ease-out", cursor: "pointer" }}
    />
  );
}

// Every qualifying entry is a real lap time on one shared scale — unlike race results (where a
// car "+2 Laps" isn't comparable in seconds to one "+24.065s"), a gap-to-pole bar chart here is
// actually a valid, not-misleading comparison.
export function QualifyingBarChart({ qualifying, driverSet }: { qualifying: ArchiveQualifyingEntry[]; driverSet: DriverSet }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const withSeconds = qualifying
    .map((q) => ({ q, seconds: parseTimeToSeconds(q.q3 ?? q.q2 ?? q.q1 ?? null) }))
    .filter((x): x is { q: ArchiveQualifyingEntry; seconds: number } => x.seconds !== null)
    .sort((a, b) => a.seconds - b.seconds);

  if (withSeconds.length === 0) return <p className="text-sm text-neutral-500">No qualifying times recorded.</p>;

  // Sorted (and pole derived) by the actual fastest recorded time, not the stored `position`
  // field — Ergast's position occasionally reflects a post-session reclassification (e.g. a grid
  // penalty) rather than pure lap-time rank, which would otherwise put a driver with a *smaller*
  // gap below one with a *larger* gap. A chart whose entire point is comparing times needs to
  // read as monotonic regardless of why the position field disagrees.
  const poleSeconds = withSeconds[0].seconds;
  const allData = withSeconds.map(({ q, seconds }) => ({
    driverName: q.driverName,
    gap: seconds - poleSeconds,
    time: q.q3 ?? q.q2 ?? q.q1,
    color: teamColor(q.constructor),
  }));
  // The shared Top 5/10/All filter (lifted to ArchiveRaceDashboard, driving Strategy too) - own
  // ordering (grid/gap-to-pole), sliced to the shared count, not the shared Strategy's own
  // finishing-position order forced onto this chart (see the parent's own comment on why).
  const data = driverSet === "all" ? allData : allData.slice(0, driverSet === "top5" ? 5 : 10);

  // Adjacent-gap differences, not each driver's own gap-to-pole - the closest *fight*, which is
  // usually two midfield cars a fraction apart, not necessarily whoever's nearest pole itself.
  // Computed from the full field regardless of the driver-set filter above - a real session fact
  // (who was actually closest), not something that should change depending on what's visible.
  let closestGap: number | null = null;
  for (let i = 1; i < allData.length; i++) {
    const diff = allData[i].gap - allData[i - 1].gap;
    if (closestGap === null || diff < closestGap) closestGap = diff;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
        <span>
          <span className="font-medium text-white">{allData[0].driverName}</span> on pole
          {allData[0].time && <span className="text-neutral-600"> · {allData[0].time}</span>}
        </span>
        {allData[1] && (
          <span>
            Margin to P2 <span className="font-medium text-neutral-300">+{allData[1].gap.toFixed(3)}s</span>
          </span>
        )}
        {closestGap !== null && (
          <span>
            Closest gap <span className="font-medium text-neutral-300">{closestGap.toFixed(3)}s</span>
          </span>
        )}
      </div>
      {/* `layout` - height is content-driven (sessionChartHeight), so switching Top 5 -> All drivers
          animates the chart smoothly taller/shorter instead of snapping. */}
      <motion.div layout initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
        <ResponsiveContainer width="100%" height={sessionChartHeight(data.length)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 8, bottom: 20 }} barCategoryGap="20%">
            {/* Vertical gridlines only (aligned to the X-axis' numeric ticks) - a horizontal-bar
                chart's own reading aid, matching every other real chart on this page. */}
            <CartesianGrid horizontal={false} stroke={chart.gridline} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tick={{ fill: chart.mutedInk, fontSize: 11 }}
              axisLine={{ stroke: chart.gridline }}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(1)}s`}
              label={{ value: "Gap to pole (s)", position: "insideBottom", offset: -6, fill: chart.mutedInk, fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="driverName"
              width={140}
              tick={{ fill: "#c3c2b7", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip cursor={false} content={QualifyingTooltip} />
            <Bar dataKey="gap" shape={AnimatedBar} minPointSize={2} maxBarSize={16}>
              {data.map((d) => (
                <Cell
                  key={d.driverName}
                  fill={d.color}
                  fillOpacity={hovered === null || hovered === d.driverName ? 0.85 : 0.25}
                  onMouseEnter={() => setHovered(d.driverName)}
                  onMouseLeave={() => setHovered(null)}
                />
              ))}
              <LabelList
                dataKey="gap"
                position="right"
                formatter={(value: unknown) => (Number(value) === 0 ? "Pole" : `+${Number(value).toFixed(3)}s`)}
                fill="#898781"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
