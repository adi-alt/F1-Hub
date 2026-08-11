"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "./chartTheme";
import type { SimulatedDriverEntry } from "@/lib/types/race";

/**
 * One stacked bar per driver, built from the raw (uncalibrated) probabilities so the segments
 * nest correctly (p1 <= podium <= top5 always holds pre-calibration, since they're cumulative
 * sums of the same simulated-position array — calibrating p1/podium independently can break that
 * ordering, which would look wrong stacked). Calibrated numbers are the ones shown as headline
 * text elsewhere; this chart is about the *shape* of each driver's distribution, not the exact
 * calibrated value.
 */
export function SimulationChart({ drivers }: { drivers: SimulatedDriverEntry[] }) {
  const data = [...drivers]
    .sort((a, b) => a.medianPosition - b.medianPosition)
    .map((d) => {
      const p1 = d.positionProbabilities[0] ?? 0;
      const podium = d.positionProbabilities.slice(0, 3).reduce((sum, p) => sum + p, 0);
      const top5 = d.positionProbabilities.slice(0, 5).reduce((sum, p) => sum + p, 0);
      return {
        name: d.driver,
        win: p1,
        podium: Math.max(0, podium - p1),
        top5: Math.max(0, top5 - podium),
        rest: Math.max(0, 1 - top5),
      };
    });

  return (
    <ResponsiveContainer width="100%" height={data.length * 28 + 20}>
      <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ left: 12, right: 12 }}>
        <CartesianGrid horizontal={false} stroke={chart.gridline} />
        <XAxis
          type="number"
          tickFormatter={(v) => `${Math.round(v * 100)}%`}
          tick={{ fill: chart.mutedInk, fontSize: 12 }}
          axisLine={{ stroke: chart.gridline }}
          tickLine={false}
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
          formatter={(value, key) => [`${(Number(value) * 100).toFixed(1)}%`, String(key)]}
        />
        <Bar dataKey="win" stackId="pos" name="P1" fill={chart.sequentialBlue} />
        <Bar dataKey="podium" stackId="pos" name="P2-P3" fill="#7fb3ec" />
        <Bar dataKey="top5" stackId="pos" name="P4-P5" fill={chart.neutralMidpoint} />
        <Bar dataKey="rest" stackId="pos" name="P6+" fill={chart.gridline} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
