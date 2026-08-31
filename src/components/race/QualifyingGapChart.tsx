"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { tooltipStyle } from "@/components/charts/chartTheme";
import { teamColor } from "@/lib/teamColors";
import type { RaceInputEntry } from "@/lib/types/race";

/** Season's own version of Archive's QualifyingBarChart.tsx - same gap-to-pole bar shape, but
 * `RaceInputEntry` only ever has one qualifying gap value (no Q1/Q2/Q3 breakdown, unlike Archive's
 * real data), so this is its own small sibling component rather than a shared one forced to
 * pretend both sides have the same input shape. */
export function QualifyingGapChart({ inputs }: { inputs: RaceInputEntry[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const sorted = [...inputs].sort((a, b) => a.grid - b.grid);
  if (sorted.length === 0) return <p className="text-sm text-neutral-500">No qualifying data recorded.</p>;

  const data = sorted.map((r) => ({
    driverName: r.driverName,
    gap: r.grid === 1 ? 0 : (r.qualifyingGapSec ?? 0),
    color: teamColor(r.team),
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 8 }} barCategoryGap="20%">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="driverName" width={140} tick={{ fill: "#c3c2b7", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(_value, _name, item) => [item.payload.gap === 0 ? "Pole" : `+${item.payload.gap.toFixed(3)}s`, ""]}
          />
          <Bar dataKey="gap" radius={[3, 3, 3, 3]} minPointSize={2} maxBarSize={16}>
            {data.map((d) => (
              <Cell
                key={d.driverName}
                fill={d.color}
                fillOpacity={hovered === null || hovered === d.driverName ? 0.85 : 0.25}
                onMouseEnter={() => setHovered(d.driverName)}
                onMouseLeave={() => setHovered(null)}
                style={{ transition: "fill-opacity 150ms ease-out" }}
              />
            ))}
            <LabelList dataKey="gap" position="right" formatter={(value: unknown) => (Number(value) === 0 ? "Pole" : `+${Number(value).toFixed(3)}s`)} fill="#898781" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
