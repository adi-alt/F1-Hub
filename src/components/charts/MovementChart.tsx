"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "./chartTheme";
import type { RaceResultEntry } from "@/lib/types/race";

export function MovementChart({ results }: { results: RaceResultEntry[] }) {
  const data = results
    .filter((r) => r.status !== "dnf" && r.grid !== null)
    .map((r) => ({ name: r.driver, movement: r.grid! - r.finishPosition }))
    .filter((d) => d.movement !== 0)
    .sort((a, b) => b.movement - a.movement);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={data.length * 28 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
        <CartesianGrid horizontal={false} stroke={chart.gridline} />
        <XAxis type="number" tick={{ fill: chart.mutedInk, fontSize: 12 }} axisLine={{ stroke: chart.gridline }} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={44}
          tick={{ fill: chart.secondaryInk, fontSize: 12 }}
          axisLine={{ stroke: chart.gridline }}
          tickLine={false}
        />
        <ReferenceLine x={0} stroke={chart.gridline} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipStyle}
          formatter={(value) => [Number(value) > 0 ? `+${value} places` : `${value} places`, "Grid → finish"]}
        />
        <Bar dataKey="movement" radius={2} maxBarSize={16}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.movement > 0 ? chart.sequentialBlue : chart.divergingRed} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
