"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { teamColor } from "@/lib/teamColors";
import type { RaceInputEntry } from "@/lib/types/race";

type DriverSet = "top5" | "top10" | "all";

/** Bar geometry animates in once (width 0 -> real value, staggered per driver) via a custom
 * `shape` - Recharts merges the sibling `<Cell>`'s fill/fillOpacity/hover handlers into these same
 * props, so this only needs to override how the rectangle itself is drawn, not re-derive any of
 * that. Width, not scaleX - these are SVG rects Recharts has already positioned at a shared left
 * edge (the 0s gridline), so animating the geometry attribute directly is simpler and more
 * reliable here than a CSS transform, which would need its own transform-origin bookkeeping for
 * no real benefit. fillOpacity (the hover dim/undim) stays a plain attribute + CSS transition, not
 * part of the framer animation - it needs to react instantly on every hover change, not just once
 * on first scroll-into-view. Same component as Archive's QualifyingBarChart.tsx - not shared,
 * since the two data shapes differ (see this file's own comment on `QualifyingGapChart`).
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

/** Season's own version of Archive's QualifyingBarChart.tsx - same gap-to-pole bar shape, but
 * `RaceInputEntry` only ever has one qualifying gap value (no Q1/Q2/Q3 breakdown, unlike Archive's
 * real data), so this is its own small sibling component rather than a shared one forced to
 * pretend both sides have the same input shape. */
export function QualifyingGapChart({ inputs }: { inputs: RaceInputEntry[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [driverSet, setDriverSet] = useState<DriverSet>("top5");
  const sorted = [...inputs].sort((a, b) => a.grid - b.grid);
  if (sorted.length === 0) return <p className="text-sm text-neutral-500">No qualifying data recorded.</p>;

  const allData = sorted.map((r) => ({
    driverName: r.driverName,
    gap: r.grid === 1 ? 0 : (r.qualifyingGapSec ?? 0),
    color: teamColor(r.team),
  }));
  // Same Top 5/10/All convention as Strategy's own driver-set switch (TireStintTimeline) - so the
  // two sides can both be compact together, not just Strategy.
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
            <YAxis type="category" dataKey="driverName" width={140} tick={{ fill: "#c3c2b7", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(_value, _name, item) => [item.payload.gap === 0 ? "Pole" : `+${item.payload.gap.toFixed(3)}s`, ""]}
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
              <LabelList dataKey="gap" position="right" formatter={(value: unknown) => (Number(value) === 0 ? "Pole" : `+${Number(value).toFixed(3)}s`)} fill="#898781" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
