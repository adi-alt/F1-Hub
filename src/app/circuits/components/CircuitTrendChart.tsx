"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
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
      fill={chart.sequentialBlue}
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
      <p className="mb-1 text-[11px] font-semibold text-white">{p.year}</p>
      {p.poleSitter && (
        <p className="text-neutral-300">
          {p.poleSitter}
          {p.team && <span className="text-neutral-500"> · {p.team}</span>}
        </p>
      )}
      <p className="mt-1 font-mono tabular-nums text-neutral-200">{p.poleTimeSec.toFixed(3)}s</p>
      {p.diffSec !== null && (
        <p className={`mt-0.5 font-mono text-[11px] tabular-nums ${p.diffSec < 0 ? "text-emerald-400" : "text-neutral-500"}`}>
          {p.diffSec < 0 ? "" : "+"}
          {p.diffSec.toFixed(3)}s vs previous year
        </p>
      )}
      <p className="mt-1.5 text-[10px] text-neutral-600">Click to open this race →</p>
    </div>
  );
}

/**
 * Pole evolution - real interactive history, not a static line. Every point is a real classified
 * pole time; the connecting line is Recharts' own monotone interpolation between them (no
 * synthetic points inserted), so "actual data" and "smoothed curve" never get confused with each
 * other. Hover shows the real driver/team/gap-to-previous-year; clicking a point opens that race's
 * own full analysis - the Circuit page stays "this track across time," the Race page stays "this
 * one event," exactly the split this section is meant to preserve.
 */
export function CircuitTrendChart({ data }: { data: PoleTrendPoint[] }) {
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

  return (
    <div>
      {data.length > 5 && (
        <div className="mb-2 flex items-center gap-1" role="group" aria-label="Pole evolution range">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              onClick={() => setRangeWindow(w.value)}
              aria-pressed={rangeWindow === w.value}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                rangeWindow === w.value ? "bg-white/[0.1] text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={shown} margin={{ left: 8, right: 16, top: 8 }}>
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
          <Tooltip content={<PoleTooltip />} cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="poleTimeSec"
            stroke={chart.sequentialBlue}
            strokeWidth={2}
            dot={<ClickableDot onSelect={openRace} />}
            activeDot={<ClickableDot onSelect={openRace} />}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">
        Pole time by year: {shown.map((p) => `${p.year}: ${p.poleTimeSec.toFixed(3)} seconds${p.poleSitter ? ` (${p.poleSitter})` : ""}`).join(", ")}.
      </p>
    </div>
  );
}
