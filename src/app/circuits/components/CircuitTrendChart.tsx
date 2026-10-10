"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { formatLapTime } from "@/lib/format";
import { raceHref } from "@/lib/routes";

export type PoleTrendPoint = {
  year: number;
  round: number;
  raceName: string;
  poleTimeSec: number;
  poleSitter: string | null;
  team: string | null;
};

type TrendWindow = 5 | 10 | null; // null = all history

const WINDOWS: { label: string; value: TrendWindow }[] = [
  { label: "Last 5", value: 5 },
  { label: "Last 10", value: 10 },
  { label: "All", value: null },
];

type TooltipPayloadEntry = { payload?: PoleTrendPoint & { diffSec: number | null } };

/** A custom dot renderer, not Recharts' `activeDot={{ onClick }}` object shorthand - that shorthand
 * spreads its `onClick` onto the underlying `<Dot>` DOM node, but its exact call signature isn't
 * part of Recharts' typed public API, and there's no local runtime here to verify it against. A
 * custom dot component's own props (`cx`/`cy`/`payload`) ARE the documented, stable contract, so
 * this reads the click target explicitly instead of trusting an untyped callback shape. */
function ClickableDot({
  cx,
  cy,
  payload,
  onSelect,
}: {
  cx?: number;
  cy?: number;
  payload?: PoleTrendPoint;
  onSelect: (point: PoleTrendPoint) => void;
}) {
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="rgb(255 255 255 / 0.9)"
      stroke="transparent"
      strokeWidth={8}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={`${payload.year} pole${payload.poleSitter ? `, ${payload.poleSitter}` : ""}, ${payload.poleTimeSec.toFixed(3)} seconds. Open this race.`}
      onClick={() => onSelect(payload)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(payload);
        }
      }}
    />
  );
}

function PoleTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="min-w-[180px] rounded-lg border px-3 py-2.5 text-xs shadow-xl backdrop-blur-md" style={{ ...tooltipStyle, borderRadius: 8 }}>
      <p className="mb-1 text-caption font-semibold text-primary">{p.year}</p>
      {p.poleSitter && (
        <p className="text-secondary">
          {p.poleSitter}
          {p.team && <span className="text-tertiary"> · {p.team}</span>}
        </p>
      )}
      <p className="mt-1 tabular text-primary">{p.poleTimeSec.toFixed(3)}s</p>
      {p.diffSec !== null && (
        <p className={`mt-0.5 text-caption tabular ${p.diffSec < 0 ? "text-emerald-400" : "text-tertiary"}`}>
          {p.diffSec < 0 ? "" : "+"}
          {p.diffSec.toFixed(3)}s vs previous year
        </p>
      )}
      <p className="mt-1.5 text-caption text-tertiary">Click to open this race →</p>
    </div>
  );
}

/**
 * Pole evolution - real interactive history, not a static line. Every point is a real classified
 * pole time; the connecting line is straight between them (a smoothed curve would invent peaks between seasons) (no
 * synthetic points inserted), so "actual data" and "smoothed curve" never get confused with each
 * other. Hover shows the real driver/team/gap-to-previous-year; clicking a point opens that race's
 * own full analysis - the Circuit page stays "this track across time," the Race page stays "this
 * one event," exactly the split this section is meant to preserve.
 */
export function CircuitTrendChart({ data, height = 320 }: { data: PoleTrendPoint[]; height?: number }) {
  const [rangeWindow, setRangeWindow] = useState<TrendWindow>(null);
  const router = useRouter();

  const withDiff = useMemo(
    () =>
      data.map((p, i) => ({
        ...p,
        diffSec: i > 0 ? p.poleTimeSec - data[i - 1].poleTimeSec : null,
      })),
    [data],
  );
  const shown = rangeWindow === null ? withDiff : withDiff.slice(-rangeWindow);

  function openRace(point: PoleTrendPoint) {
    router.push(raceHref(point.year, point.round, point.raceName));
  }

  const fastest = shown.reduce((a, b) => (b.poleTimeSec < a.poleTimeSec ? b : a), shown[0]);
  const lap = formatLapTime;
  const lo = Math.floor(Math.min(...shown.map((p) => p.poleTimeSec))) - 1;
  const hi = Math.ceil(Math.max(...shown.map((p) => p.poleTimeSec))) + 1;

  return (
    <div>
      {/* Headline above the chart (spec §7): the answer, then the shape. */}
      <p className="mb-4 text-body text-primary">
        Fastest pole: <span className="font-semibold tabular">{lap(fastest.poleTimeSec)}</span>
        {fastest.poleSitter ? `, ${fastest.poleSitter}` : ""} in {fastest.year}
        <span className="text-secondary"> · {shown.length} seasons</span>
      </p>
      {data.length > 5 && (
        <div className="mb-3 flex items-center gap-1" role="group" aria-label="Pole evolution range">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              onClick={() => setRangeWindow(w.value)}
              aria-pressed={rangeWindow === w.value}
              className={`rounded-sm px-2.5 py-1 text-caption font-medium transition-colors duration-fast ${
                rangeWindow === w.value ? "bg-white/[0.08] text-primary" : "text-secondary hover:text-primary"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={shown} margin={{ left: 8, right: 16, top: 8 }}>
          <defs>
            <linearGradient id="poleEvolutionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(255 255 255)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="rgb(255 255 255)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chart.gridline} vertical={false} />
          {/* type="number" (not the default "category") - years are real elapsed time, not evenly
              spaced labels. A category axis was compressing a real 3-year gap (2019->2022, no
              race in 2020/2021) into the same visual width as a 1-year gap, which then made the
              monotone curve bend through that gap as if it were as sudden as any single-year
              change - a real distortion, not just a stylistic complaint. Numeric spacing fixes it
              at the source rather than picking a different curve type to paper over it. */}
          <XAxis
            dataKey="year"
            type="number"
            domain={["dataMin", "dataMax"]}
            allowDecimals={false}
            tick={{ fill: chart.mutedInk, fontSize: 12 }}
            axisLine={{ stroke: chart.gridline }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: chart.mutedInk, fontSize: 12 }}
            axisLine={{ stroke: chart.gridline }}
            tickLine={false}
            width={64}
            domain={[lo, hi]}
            allowDecimals={false}
            tickFormatter={(v: number) => lap(v).replace(/\.\d+$/, "")}
          />
          <Tooltip content={<PoleTooltip />} cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }} />
          <Area
            type="linear"
            dataKey="poleTimeSec"
            stroke="rgb(255 255 255 / 0.8)"
            strokeWidth={2.5}
            fill="url(#poleEvolutionFill)"
            dot={<ClickableDot onSelect={openRace} />}
            activeDot={<ClickableDot onSelect={openRace} />}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="sr-only">
        Pole time by year: {shown.map((p) => `${p.year}: ${p.poleTimeSec.toFixed(3)} seconds${p.poleSitter ? ` (${p.poleSitter})` : ""}`).join(", ")}.
      </p>
    </div>
  );
}
