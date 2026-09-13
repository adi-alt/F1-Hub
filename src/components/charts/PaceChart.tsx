"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "./chartTheme";

export function PaceChart({ paceGapSec }: { paceGapSec: Record<string, number> }) {
  const data = Object.entries(paceGapSec)
    .map(([driver, gap]) => ({ name: driver, gap }))
    .sort((a, b) => a.gap - b.gap);

  return (
    <ResponsiveContainer width="100%" height={data.length * 26 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 12, right: 32 }}>
        <CartesianGrid horizontal={false} stroke={chart.gridline} />
        <XAxis
          type="number"
          tick={{ fill: chart.mutedInk, fontSize: 12 }}
          axisLine={{ stroke: chart.gridline }}
          tickLine={false}
          unit="s"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={44}
          tick={{ fill: chart.secondaryInk, fontSize: 12 }}
          axisLine={{ stroke: chart.gridline }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipStyle}
          formatter={(value) => [`+${Number(value).toFixed(3)}s`, "Predicted gap to fastest"]}
        />
        <Bar dataKey="gap" fill={chart.sequentialBlue} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
