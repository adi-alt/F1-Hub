"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";

type Metric = "points" | "gap";
type TooltipPayloadEntry = { dataKey?: string | number; value?: number | string; color?: string; payload?: { raceName?: string; round?: number } };

// SVG ids can't safely contain spaces ("Red Bull Racing", "Aston Martin", …) once referenced via
// url(#id) — sanitize so every team/driver code produces a valid gradient/filter reference.
function safeId(code: string): string {
  return code.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function ProgressionTooltip({
  active,
  payload,
  labelFor,
  metric,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  labelFor: (code: string) => string;
  metric: Metric;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const raceName = payload[0]?.payload?.raceName ?? "";
  const round = payload[0]?.payload?.round;
  const sorted = [...payload].sort((x, y) => {
    const xv = Number(x.value ?? 0);
    const yv = Number(y.value ?? 0);
    return metric === "gap" ? xv - yv : yv - xv;
  });
  return (
    <div className="min-w-[200px] rounded-lg border px-3 py-2.5 text-xs shadow-xl backdrop-blur-md" style={{ ...tooltipStyle, borderRadius: 8 }}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white">
        {round != null ? `Round ${round} ` : ""}
        {raceName}
      </p>
      <div className="flex flex-col gap-1">
        {sorted.map((entry, i) => (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-neutral-300">
              <span className="w-3 shrink-0 font-mono text-[10px] text-neutral-600">P{i + 1}</span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: entry.color }} />
              {labelFor(String(entry.dataKey))}
            </span>
            <span className="font-mono tabular-nums text-white">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChampionshipTrajectory({
  chartData,
  curves,
  metric,
  labelFor,
  highlightTrack,
}: {
  chartData: Record<string, number | string | null>[];
  curves: { code: string; color: string; dashed: boolean }[];
  metric: Metric;
  labelFor: (code: string) => string;
  highlightTrack: string | null;
}) {
  const [activeCode, setActiveCode] = useState<string | null>(null);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
        <defs>
          {curves.map(({ code, color }) => (
            <linearGradient key={code} id={`progression-fill-${safeId(code)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          ))}
          {curves.map(({ code }) => (
            <filter key={code} id={`progression-glow-${safeId(code)}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>
        <CartesianGrid stroke={chart.gridline} strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="trackShort" tick={{ fill: chart.mutedInk, fontSize: 11 }} axisLine={{ stroke: chart.gridline }} tickLine={false} interval="preserveStartEnd" />
        <YAxis reversed={metric === "gap"} tick={{ fill: chart.mutedInk, fontSize: 12 }} axisLine={{ stroke: chart.gridline }} tickLine={false} width={36} />
        {highlightTrack && <ReferenceLine x={highlightTrack} stroke="var(--f1-red)" strokeOpacity={0.55} strokeDasharray="4 4" />}
        <Tooltip content={<ProgressionTooltip labelFor={labelFor} metric={metric} />} cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }} />
        {curves.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: chart.mutedInk, cursor: "pointer" }}
            formatter={(value) => labelFor(String(value))}
            onMouseEnter={(o) => setActiveCode(String(o.dataKey ?? o.value))}
            onMouseLeave={() => setActiveCode(null)}
          />
        )}
        {curves.map(({ code, color, dashed }) => {
          const dimmed = activeCode !== null && activeCode !== code;
          return (
            <Area
              key={code}
              type="natural"
              dataKey={code}
              name={code}
              stroke={color}
              strokeWidth={2}
              strokeOpacity={dimmed ? 0.28 : 1}
              fillOpacity={dimmed ? 0.4 : 1}
              strokeDasharray={dashed ? "5 4" : undefined}
              style={{
                // Glow is an emphasis effect, not a resting-state look - restrained by
                // default, only the curve actually under the cursor gets it.
                filter: activeCode === code ? `url(#progression-glow-${safeId(code)})` : undefined,
                transition: "opacity 200ms ease, stroke-opacity 200ms ease, fill-opacity 200ms ease",
              }}
              fill={`url(#progression-fill-${safeId(code)})`}
              onMouseEnter={() => setActiveCode(code)}
              onMouseLeave={() => setActiveCode(null)}
              dot={(props: { cx?: number; cy?: number; index?: number }) => {
                const isLast = props.index === chartData.length - 1;
                if (!isLast || props.cx == null || props.cy == null) return <g key={`d-${code}-${props.index}`} />;
                return <circle key={`d-${code}-${props.index}`} cx={props.cx} cy={props.cy} r={3.5} fill={color} stroke="#09090b" strokeWidth={1.5} opacity={dimmed ? 0.4 : 1} />;
              }}
              activeDot={{ r: 4, stroke: "#09090b", strokeWidth: 1.5 }}
              animationDuration={700}
              animationEasing="ease-out"
              connectNulls
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
