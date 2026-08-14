"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { tooltipStyle } from "@/components/charts/chartTheme";
import { parseTimeToSeconds } from "@/lib/parseTimeToSeconds";
import { teamColor } from "@/lib/teamColors";
import type { ArchiveQualifyingEntry } from "@/lib/firestore/archive";

// Every qualifying entry is a real lap time on one shared scale — unlike race results (where a
// car "+2 Laps" isn't comparable in seconds to one "+24.065s"), a gap-to-pole bar chart here is
// actually a valid, not-misleading comparison.
export function QualifyingBarChart({ qualifying }: { qualifying: ArchiveQualifyingEntry[] }) {
  const withSeconds = qualifying
    .map((q) => ({ q, seconds: parseTimeToSeconds(q.q3 ?? q.q2 ?? q.q1 ?? null) }))
    .filter((x): x is { q: ArchiveQualifyingEntry; seconds: number } => x.seconds !== null)
    .sort((a, b) => a.seconds - b.seconds);

  if (withSeconds.length === 0) return <p className="text-sm text-neutral-500">No qualifying times recorded.</p>;

  // Sorted (and pole derived) by the actual fastest recorded time, not the stored `position`
  // field — Ergast's position occasionally reflects a post-session reclassification (e.g. a grid
  // penalty) rather than pure lap-time rank, which would otherwise put a driver with a *smaller*
  // gap below one with a *larger* gap. A chart whose entire point is comparing times needs to
  // read as monotonic regardless of why the position field disagrees.
  const poleSeconds = withSeconds[0].seconds;
  const data = withSeconds.map(({ q, seconds }) => ({
    driverName: q.driverName,
    gap: seconds - poleSeconds,
    time: q.q3 ?? q.q2 ?? q.q1,
    color: teamColor(q.constructor),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(260, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 8 }} barCategoryGap="20%">
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="driverName"
          width={140}
          tick={{ fill: "#c3c2b7", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(_value, _name, item) => [
            `${item.payload.time} (${item.payload.gap === 0 ? "pole" : `+${item.payload.gap.toFixed(3)}s`})`,
            "",
          ]}
        />
        <Bar dataKey="gap" radius={[3, 3, 3, 3]} minPointSize={2} maxBarSize={16}>
          {data.map((d) => (
            <Cell key={d.driverName} fill={d.color} fillOpacity={0.85} />
          ))}
          <LabelList
            dataKey="gap"
            position="right"
            formatter={(value: unknown) => (Number(value) === 0 ? "Pole" : `+${Number(value).toFixed(3)}s`)}
            fill="#898781"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
