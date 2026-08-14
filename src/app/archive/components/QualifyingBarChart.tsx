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
  const sorted = [...qualifying].sort((a, b) => a.position - b.position);
  const poleSeconds = parseTimeToSeconds(sorted[0]?.q3 ?? sorted[0]?.q2 ?? sorted[0]?.q1 ?? null);

  const data = sorted
    .map((q) => {
      const best = q.q3 ?? q.q2 ?? q.q1 ?? null;
      const seconds = parseTimeToSeconds(best);
      if (seconds === null || poleSeconds === null) return null;
      return {
        driverName: q.driverName,
        gap: seconds - poleSeconds,
        time: best,
        position: q.position,
        color: teamColor(q.constructor),
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (data.length === 0) return <p className="text-sm text-neutral-500">No qualifying times recorded.</p>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56, top: 8 }}>
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
            `P${item.payload.position} — ${item.payload.time} (${item.payload.gap === 0 ? "pole" : `+${item.payload.gap.toFixed(3)}s`})`,
            "",
          ]}
        />
        <Bar dataKey="gap" radius={[0, 4, 4, 0]} minPointSize={2}>
          {data.map((d) => (
            <Cell key={d.driverName} fill={d.color} />
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
