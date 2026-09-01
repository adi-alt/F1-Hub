"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { parseTimeToSeconds } from "@/lib/parseTimeToSeconds";
import { teamColor } from "@/lib/teamColors";
import type { ArchiveQualifyingEntry } from "@/lib/supabase/archive";

type DriverSet = "top5" | "top10" | "all";

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
export function QualifyingBarChart({ qualifying }: { qualifying: ArchiveQualifyingEntry[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [driverSet, setDriverSet] = useState<DriverSet>("top5");
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
  // Same Top 5/10/All convention as Strategy's own driver-set switch (PitStopsTimeline,
  // TireStintTimeline) - so the two sides can both be compact together, not just Strategy.
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
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
        {allData.length > 5 && (
          <QuietTabs
            options={[
              { value: "top5" as const, label: "Top 5" },
              { value: "top10" as const, label: "Top 10" },
              { value: "all" as const, label: "All drivers" },
            ]}
            value={driverSet}
            onChange={setDriverSet}
            className="text-xs"
          />
        )}
      </div>
      {/* `layout` - height is content-driven (Math.max(260, data.length * 28)), so switching
          Top 5 -> All drivers animates the chart smoothly taller/shorter instead of snapping. */}
      <motion.div layout initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
        <ResponsiveContainer width="100%" height={Math.max(260, data.length * 28)}>
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
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(_value, _name, item) => [
                `${item.payload.time} (${item.payload.gap === 0 ? "pole" : `+${item.payload.gap.toFixed(3)}s`})`,
                "",
              ]}
            />
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
