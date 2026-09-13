"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "./chartTheme";

const FEATURE_LABELS: Record<string, string> = {
  grid: "Grid position",
  qualifyingGapSec: "Qualifying gap",
  driverRecentFinish: "Driver recent form",
  teamRecentFinish: "Team recent form",
  driverHistoryCount: "Driver history depth",
  teamHistoryCount: "Team history depth",
  driverRecentQuali: "Driver recent quali form",
  teamRecentQuali: "Team recent quali form",
};

export function FeatureImportanceChart({ importance }: { importance: Record<string, number> }) {
  const data = Object.entries(importance)
    .map(([key, value]) => ({ name: FEATURE_LABELS[key] ?? key, value: Math.round(value * 1000) / 10 }))
    .sort((a, b) => b.value - a.value);

  if (data.every((d) => d.value === 0)) return null;

  return (
    <ResponsiveContainer width="100%" height={data.length * 40 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
        <CartesianGrid horizontal={false} stroke={chart.gridline} />
        <XAxis type="number" tick={{ fill: chart.mutedInk, fontSize: 12 }} unit="%" axisLine={{ stroke: chart.gridline }} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={170}
          tick={{ fill: chart.secondaryInk, fontSize: 12 }}
          axisLine={{ stroke: chart.gridline }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipStyle}
          formatter={(value) => [`${value}%`, "Importance"]}
        />
        <Bar dataKey="value" fill={chart.sequentialBlue} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
