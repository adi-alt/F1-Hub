"use client";

import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { teamColor } from "@/lib/teamColors";
import type { ArchivePitStopEntry, ArchiveResultEntry } from "@/lib/supabase/archive";

type Point = { driverName: string; lap: number; durationSec: number | null; color: string; order: number };

// Longer stops get a visibly bigger dot — clamped so one freak 60s stop-and-retire doesn't make
// every normal ~2.5s stop invisible by comparison.
function radiusFor(durationSec: number | null): number {
  if (durationSec === null) return 5;
  return Math.min(14, Math.max(5, durationSec / 2));
}

function Dot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  return <circle cx={cx} cy={cy} r={radiusFor(payload.durationSec)} fill={payload.color} fillOpacity={0.85} />;
}

// Shows *when* the field stopped and roughly how long, at a glance — lap on the x-axis, one row
// per driver (ordered by finishing position) on the y-axis, dot size scaled to stop duration.
export function PitStopsTimeline({
  pitStops,
  results,
}: {
  pitStops: ArchivePitStopEntry[];
  results: ArchiveResultEntry[];
}) {
  const nameFor = (driverId: string) => results.find((r) => r.driverId === driverId)?.driverName ?? driverId;
  const colorFor = (driverId: string) => {
    const constructor = results.find((r) => r.driverId === driverId)?.constructor;
    return constructor ? teamColor(constructor) : chart.mutedInk;
  };

  const driverOrder = results.map((r) => r.driverId).filter((id) => pitStops.some((p) => p.driverId === id));

  // Recharts derives a category axis's row order from first-appearance in `data`, not from
  // alphabetical or any other implicit rule — sorting by finishing position here (rather than
  // pit-stop order, which is what this produced before the fix) is what makes the chart read as
  // an ordered comparison instead of a seemingly-random diagonal scatter.
  const data: Point[] = pitStops
    .map((p) => ({
      driverName: nameFor(p.driverId),
      lap: p.lap,
      durationSec: p.durationSec,
      color: colorFor(p.driverId),
      order: driverOrder.indexOf(p.driverId),
    }))
    .sort((a, b) => a.order - b.order);

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, driverOrder.length * 26)}>
      <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 24 }}>
        <XAxis
          type="number"
          dataKey="lap"
          name="Lap"
          tick={{ fill: chart.mutedInk, fontSize: 12 }}
          axisLine={{ stroke: chart.gridline }}
          tickLine={false}
          label={{ value: "Lap", position: "insideBottom", offset: -16, fill: chart.mutedInk, fontSize: 12 }}
        />
        <YAxis
          type="category"
          dataKey="driverName"
          name="Driver"
          width={140}
          tick={{ fill: "#c3c2b7", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name, item) => {
            const duration = (item?.payload as Point | undefined)?.durationSec;
            return name === "lap"
              ? [`Lap ${value}`, ""]
              : [duration !== null && duration !== undefined ? `${duration.toFixed(3)}s` : "—", "Duration"];
          }}
        />
        <Scatter data={data} shape={<Dot />} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
