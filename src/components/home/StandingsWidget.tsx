"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { ExportMenu } from "@/components/export/ExportMenu";
import { staggerItem } from "@/components/motion/variants";
import { svgToCanvas, tableToCanvas } from "@/lib/export";
import type { DriverStanding } from "@/lib/personalization";

export type StandingsVariant = "table" | "bar" | "line";

// 12 distinct hues before any cycling kicks in — the progression chart can show every scored
// driver on a full grid (~20), not just a top-5 preview, so it needs more than a 5-color palette.
const LINE_COLORS = [
  chart.sequentialBlue,
  chart.divergingRed,
  "#e8c547",
  "#63c992",
  "#b280e0",
  "#f97316",
  "#22d3ee",
  "#f472b6",
  "#84cc16",
  "#a78bfa",
  "#facc15",
  "#38bdf8",
];

/** Picked server-side (Math.random() in a client component would desync from the server-rendered
 * HTML and either flash-change on hydration or trigger a real mismatch warning) and passed down
 * as a prop — see src/app/page.tsx. Three ways to look at the exact same standings: a plain
 * ranked table, a horizontal bar chart of points, or a cumulative points-by-round curve for the
 * top few — table and chart, deliberately not always the same view every visit. */
export function StandingsWidget({
  variant,
  drivers,
  progression,
  progressionDrivers,
}: {
  variant: StandingsVariant;
  drivers: DriverStanding[];
  progression: Record<string, number | string>[];
  /** Who the "line" variant plots — defaults to the same top-5 preview as table/bar. The season
   * page passes every driver with nonzero points instead, since it's the full detailed view. */
  progressionDrivers?: DriverStanding[];
}) {
  const top = drivers.slice(0, 5);
  const progressionTop = progressionDrivers ?? top;
  const chartWrapRef = useRef<HTMLDivElement>(null);

  const driverRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: ["Pos", "Driver", "Team", "Points"],
    rows: top.map((d, i) => [i + 1, d.driverName, d.team, d.points]),
  });

  async function getChartSvgImage(): Promise<HTMLCanvasElement | null> {
    const svg = chartWrapRef.current?.querySelector("svg");
    return svg ? svgToCanvas(svg) : null;
  }

  if (variant === "table") {
    return (
      <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={staggerItem}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="pb-2 font-medium">Pos</th>
              <th className="pb-2 font-medium">Driver</th>
              <th className="pb-2 font-medium">Team</th>
              <th className="pb-2 text-right font-medium">Points</th>
              <th className="w-8 pb-2 text-center">
                <ExportMenu filename="standings" getRows={driverRows} getImage={async () => tableToCanvas(driverRows().columns, driverRows().rows)} className="mx-auto" />
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((d, i) => (
              <tr key={d.driver} className="border-t border-[var(--f1-line)]">
                <td className="py-2 text-neutral-500">{i + 1}</td>
                <td className="py-2 font-medium text-white">{d.driverName}</td>
                <td className="py-2 text-neutral-400">{d.team}</td>
                <td className="py-2 text-right font-mono tabular-nums text-white">{d.points}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    );
  }

  if (variant === "bar") {
    const data = top.map((d) => ({ name: d.driver, points: d.points })).sort((a, b) => a.points - b.points);
    return (
      <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={staggerItem}>
        <div className="mb-2 flex justify-end">
          <ExportMenu filename="standings" getRows={driverRows} getImage={getChartSvgImage} />
        </div>
        <div ref={chartWrapRef}>
          <ResponsiveContainer width="100%" height={data.length * 32 + 20}>
            <BarChart data={data} layout="vertical" margin={{ left: 12, right: 32 }}>
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
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={tooltipStyle} formatter={(value) => [`${value} pts`, "Points"]} />
              <Bar dataKey="points" fill={chart.sequentialBlue} radius={[0, 4, 4, 0]} maxBarSize={20} animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    );
  }

  // "line": cumulative points by round for progressionTop (every scored driver on the season
  // page, just the top-5 preview elsewhere) — a gradient-filled smooth area curve rather than a
  // plain stroked line, animated in on scroll (recharts' own path/area animation, not a second
  // motion system fighting it) for the "modern curve" look. X-axis labels the real race name
  // (already computed alongside each round by computeChampionshipProgression), not a bare round
  // number.
  const progressionRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: ["Race", ...progressionTop.map((d) => d.driverName)],
    rows: progression.map((row) => [row.raceName, ...progressionTop.map((d) => row[d.driver] ?? "")]),
  });

  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={staggerItem}>
      <div className="mb-2 flex justify-end">
        <ExportMenu filename="points-progression" getRows={progressionRows} getImage={getChartSvgImage} />
      </div>
      <div ref={chartWrapRef}>
        <ResponsiveContainer width="100%" height={progressionTop.length > 5 ? 340 : 240}>
          <AreaChart data={progression} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
            <defs>
              {progressionTop.map((d, i) => (
                <linearGradient key={d.driver} id={`progression-fill-${d.driver}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLORS[i % LINE_COLORS.length]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={LINE_COLORS[i % LINE_COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={chart.gridline} vertical={false} />
            <XAxis dataKey="raceName" tick={{ fill: chart.mutedInk, fontSize: 11 }} axisLine={{ stroke: chart.gridline }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: chart.mutedInk, fontSize: 12 }} axisLine={{ stroke: chart.gridline }} tickLine={false} width={36} />
            <Tooltip contentStyle={tooltipStyle} />
            {progressionTop.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: chart.mutedInk }} />}
            {progressionTop.map((d, i) => (
              <Area
                key={d.driver}
                type="monotone"
                dataKey={d.driver}
                name={d.driverName}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                fill={`url(#progression-fill-${d.driver})`}
                dot={false}
                activeDot={{ r: 4 }}
                animationDuration={900}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
