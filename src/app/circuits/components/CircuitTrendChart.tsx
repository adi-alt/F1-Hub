"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";

export function CircuitTrendChart({ data }: { data: { year: number; poleTimeSec: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid stroke={chart.gridline} vertical={false} />
        <XAxis dataKey="year" tick={{ fill: chart.mutedInk, fontSize: 12 }} axisLine={{ stroke: chart.gridline }} tickLine={false} />
        <YAxis
          tick={{ fill: chart.mutedInk, fontSize: 12 }}
          axisLine={{ stroke: chart.gridline }}
          tickLine={false}
          unit="s"
          width={56}
          domain={["dataMin - 1", "dataMax + 1"]}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toFixed(3)}s`, "Pole time"]} />
        <Line
          type="monotone"
          dataKey="poleTimeSec"
          stroke={chart.sequentialBlue}
          strokeWidth={2}
          dot={{ r: 4, fill: chart.sequentialBlue, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
