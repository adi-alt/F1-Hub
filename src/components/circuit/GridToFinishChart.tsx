"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { teamColor } from "@/lib/teamColors";
import type { TireStint } from "@/lib/types/race";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";

// Built on Recharts - the one chart library already established across this app (CircuitTrendChart,
// ChampionshipTrajectory, every Season/Race analysis chart), not a second one introduced for this
// single component. Hover-to-dim-the-rest follows the exact same per-series onMouseEnter/activeCode
// pattern ChampionshipTrajectory already uses, for the same reason: one real convention, not two.

type Row = { stage: "Grid" | "Finish"; [driverCode: string]: string | number };
type DriverMeta = { driver: string; driverName: string; team: string; grid: number; finish: number };

/** Only the fields this chart actually reads - both real callers pass a different result type
 * (TrackMap's full `RaceResultEntry`, CurrentSeasonPerformance's smaller `RaceResultSummary`),
 * and they already agree structurally on every field used here. A narrow local type lets both
 * satisfy this prop for real, instead of one of them reaching for an `any` cast to paper over a
 * mismatch in fields neither caller nor this component ever touches. */
type ResultLike = { driver: string; driverName: string; team: string; grid: number | null; finishPosition: number };

// `tireStints` isn't plotted here (this chart is a pure grid->finish slope), but stays part of the
// prop contract - both real callers (TrackMap, CurrentSeasonPerformance) already pass it, and it's
// a natural fit for a future pit-stop marker on this same chart.
export function GridToFinishChart({ results }: { results: ResultLike[]; tireStints: TireStint[] }) {
  const [hoverDriver, setHoverDriver] = useState<string | null>(null);

  const { rows, drivers } = useMemo(() => {
    const valid = results.filter((r) => r.grid != null && r.grid > 0 && r.finishPosition > 0);
    const drivers: DriverMeta[] = valid.map((r) => ({ driver: r.driver, driverName: r.driverName, team: r.team, grid: r.grid as number, finish: r.finishPosition }));
    const gridRow: Row = { stage: "Grid" };
    const finishRow: Row = { stage: "Finish" };
    for (const d of drivers) {
      gridRow[d.driver] = d.grid;
      finishRow[d.driver] = d.finish;
    }
    return { rows: [gridRow, finishRow], drivers: drivers.sort((a, b) => a.finish - b.finish) };
  }, [results]);

  if (drivers.length === 0) {
    return <p className="text-sm text-neutral-500">No position data available for this race.</p>;
  }

  const maxRank = Math.max(...drivers.flatMap((d) => [d.grid, d.finish]), 20);
  const hovered = drivers.find((d) => d.driver === hoverDriver) ?? null;

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ left: 8, right: 24, top: 12, bottom: 4 }}>
          <XAxis dataKey="stage" type="category" tick={{ fill: chart.mutedInk, fontSize: 12 }} axisLine={{ stroke: chart.gridline }} tickLine={false} />
          <YAxis
            reversed
            domain={[1, maxRank]}
            tick={{ fill: chart.mutedInk, fontSize: 11 }}
            axisLine={{ stroke: chart.gridline }}
            tickLine={false}
            width={28}
            allowDecimals={false}
          />
          {drivers.map((d) => {
            const dimmed = hoverDriver !== null && hoverDriver !== d.driver;
            return (
              <Line
                key={d.driver}
                type="linear"
                dataKey={d.driver}
                name={d.driverName}
                stroke={teamColor(d.team)}
                strokeWidth={hoverDriver === d.driver ? 3 : 2}
                strokeOpacity={dimmed ? 0.2 : 1}
                dot={{ r: hoverDriver === d.driver ? 4 : 3, fill: teamColor(d.team), strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                onMouseEnter={() => setHoverDriver(d.driver)}
                onMouseLeave={() => setHoverDriver((cur) => (cur === d.driver ? null : cur))}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-1 flex min-h-[52px] items-center justify-center rounded-lg border px-3 py-2 text-xs" style={{ ...tooltipStyle, borderRadius: 8, background: "transparent", border: "1px solid transparent" }}>
        {hovered ? (
          <div className="flex flex-col items-center gap-1">
            <span className="font-semibold text-white" style={{ color: teamColor(hovered.team) }}>
              {hovered.driverName}
            </span>
            <span className="text-neutral-300">
              Started P{hovered.grid}, finished P{hovered.finish}
              <span className={`ml-2 font-mono tabular-nums ${hovered.grid - hovered.finish > 0 ? "text-emerald-400" : hovered.grid - hovered.finish < 0 ? "text-red-400" : "text-neutral-500"}`}>
                {hovered.grid - hovered.finish > 0 ? `▲ +${hovered.grid - hovered.finish}` : hovered.grid - hovered.finish < 0 ? `▼ ${hovered.grid - hovered.finish}` : "—"}
              </span>
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-neutral-600">Hover a line for grid → finish detail</span>
        )}
      </div>
    </div>
  );
}
