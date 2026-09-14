"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { teamColor } from "@/lib/teamColors";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import type { RaceSummary } from "@/app/season/_service/season.pure";

/**
 * What this deliberately is NOT: a lap-by-lap position-progression chart. This app has no
 * per-lap classification anywhere in its data layer - only a driver's start (grid) and finish
 * position - so a curve claiming to show position changing smoothly through the race would be
 * inventing every point between those two real ones. This shows exactly the two real data points
 * every driver has, as a two-column slope chart: grid on the left, finish on the right, one line
 * per driver. It is the honest version of "how did the order change here" - what moved, and by how
 * much - without pretending to know when or why during the race itself.
 *
 * Uses the same chart library (Recharts) every other visualization in this app already uses.
 */
export function GridToFinishChart({ race, limit = 10 }: { race: RaceSummary; limit?: number }) {
  const withGrid = race.results.filter((r) => r.grid != null);
  if (withGrid.length === 0) return null;

  // Default to the podium plus the biggest movers, not all 20 - a chart with every driver on it
  // reads as a tangle at this size. Sorted by absolute movement so "the story" surfaces first.
  const ranked = [...withGrid].sort((a, b) => a.finishPosition - b.finishPosition);
  const podium = ranked.filter((r) => r.finishPosition <= 3);
  const movers = [...withGrid]
    .filter((r) => r.finishPosition > 3)
    .sort((a, b) => Math.abs((b.grid as number) - b.finishPosition) - Math.abs((a.grid as number) - a.finishPosition))
    .slice(0, Math.max(0, limit - podium.length));
  const shown = [...podium, ...movers];

  const data = [
    { stage: "Grid", ...Object.fromEntries(shown.map((r) => [r.driver, r.grid])) },
    { stage: "Finish", ...Object.fromEntries(shown.map((r) => [r.driver, r.finishPosition])) },
  ];

  const maxPos = Math.max(...withGrid.map((r) => Math.max(r.grid as number, r.finishPosition)));
  const summary = shown
    .map((r) => `${r.driverName}: P${r.grid} to P${r.finishPosition}${r.status === "dnf" ? " (did not finish)" : ""}`)
    .join(". ");

  return (
    <figure className="m-0">
      <figcaption className="sr-only">Grid to finish position for {shown.length} drivers. {summary}.</figcaption>
    <ResponsiveContainer width="100%" height={Math.max(220, shown.length * 16)}>
      <LineChart data={data} margin={{ left: 8, right: 56, top: 8, bottom: 8 }}>
        <XAxis dataKey="stage" type="category" tick={{ fill: chart.mutedInk, fontSize: 12 }} axisLine={{ stroke: chart.gridline }} tickLine={false} />
        <YAxis reversed domain={[1, maxPos]} allowDecimals={false} tick={{ fill: chart.mutedInk, fontSize: 11 }} axisLine={{ stroke: chart.gridline }} tickLine={false} width={28} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [`P${value}`, name]}
        />
        {shown.map((r) => (
          <Line
            key={r.driver}
            type="linear"
            dataKey={r.driver}
            name={r.driverName}
            stroke={teamColor(r.team)}
            strokeWidth={r.finishPosition <= 3 ? 2.5 : 1.5}
            dot={{ r: 3, strokeWidth: 0, fill: teamColor(r.team) }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    </figure>
  );
}
