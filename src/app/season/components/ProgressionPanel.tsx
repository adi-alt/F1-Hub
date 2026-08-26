"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { useSeasonExplorer } from "./SeasonExplorerContext";
import { useSeasonFavorites } from "./SeasonFavoritesContext";
import type { ConstructorStandingRow, DriverStandingRow } from "../services/season.service";

type Metric = "points" | "gap";
type DriverSet = "top5" | "following" | "custom";

// 12 distinct hues before any cycling — enough for a full custom selection, not just a top-5.
const COLORS = [
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

/** One chart, driven by two small controls (metric, driver-set) instead of several separate
 * charts — switching Drivers/Constructors on the standings above updates who this plots, without
 * a different UI. Team progression is derived client-side (sum of that team's drivers' cumulative
 * points per round) rather than a second server fetch, since the per-driver data already covers it. */
export function ProgressionPanel({
  drivers,
  constructors,
  progression,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string>[];
}) {
  const { entityType } = useSeasonExplorer();
  const { favDrivers, favTeams } = useSeasonFavorites();
  const [metric, setMetric] = useState<Metric>("points");
  const [driverSet, setDriverSet] = useState<DriverSet>("top5");
  const [customCodes, setCustomCodes] = useState<string[]>([]);
  const isDrivers = entityType === "drivers";

  // A driver-code custom selection means nothing once entityType flips to teams (and vice versa)
  // — reset it during render (React's own "adjust state when a prop changes" pattern) rather than
  // leave the chart silently empty because none of the stale codes match. Cheaper than an effect:
  // this bails out before committing the stale-selection render at all.
  const [prevEntityType, setPrevEntityType] = useState(entityType);
  if (prevEntityType !== entityType) {
    setPrevEntityType(entityType);
    setCustomCodes([]);
  }

  // Team progression isn't fetched separately — every scored driver's cumulative points are
  // already in `progression`, so a team's is just its two drivers' summed per round.
  const teamProgression = useMemo((): Record<string, number | string>[] => {
    if (isDrivers) return progression;
    return progression.map((row) => {
      const sums: Record<string, number> = {};
      for (const d of drivers) {
        const v = row[d.driver];
        if (typeof v === "number") sums[d.team] = (sums[d.team] ?? 0) + v;
      }
      return { round: row.round, raceName: row.raceName, trackShort: row.trackShort, ...sums };
    });
  }, [isDrivers, progression, drivers]);

  const allCodes = isDrivers ? drivers.filter((d) => d.points > 0).map((d) => d.driver) : constructors.filter((c) => c.points > 0).map((c) => c.team);
  const labelFor = (code: string) => (isDrivers ? drivers.find((d) => d.driver === code)?.driverName ?? code : code);

  const activeCodes = useMemo(() => {
    if (driverSet === "top5") return (isDrivers ? drivers : constructors).slice(0, 5).map((x) => (isDrivers ? (x as DriverStandingRow).driver : (x as ConstructorStandingRow).team));
    if (driverSet === "following") {
      return isDrivers
        ? drivers.filter((d) => d.favoriteId && favDrivers.has(d.favoriteId)).map((d) => d.driver)
        : constructors.filter((c) => favTeams.has(c.favoriteId)).map((c) => c.team);
    }
    return customCodes;
  }, [driverSet, isDrivers, drivers, constructors, favDrivers, favTeams, customCodes]);

  const leaderCode = (isDrivers ? drivers[0]?.driver : constructors[0]?.team) ?? "";

  const chartData = useMemo(() => {
    if (metric === "points") return teamProgression;
    return teamProgression.map((row) => {
      const leaderValue = typeof row[leaderCode] === "number" ? (row[leaderCode] as number) : 0;
      const out: Record<string, number | string> = { round: row.round, raceName: row.raceName, trackShort: row.trackShort };
      for (const code of activeCodes) {
        const v = row[code];
        out[code] = typeof v === "number" ? leaderValue - v : 0;
      }
      return out;
    });
  }, [metric, teamProgression, leaderCode, activeCodes]);

  function toggleCustom(code: string) {
    setCustomCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  if (allCodes.length === 0) {
    return <p className="text-sm text-neutral-500">No {isDrivers ? "driver" : "constructor"} has scored yet this season.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-full border border-[var(--f1-line)] bg-black/20 p-1">
          {(["points", "gap"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded-full px-3.5 py-1 text-xs font-medium capitalize transition ${
                metric === m ? "bg-[var(--f1-red)] text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              {m === "gap" ? "Gap to leader" : "Points"}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 rounded-full border border-[var(--f1-line)] bg-black/20 p-1">
          {(["top5", "following", "custom"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setDriverSet(s)}
              className={`rounded-full px-3.5 py-1 text-xs font-medium capitalize transition ${
                driverSet === s ? "bg-[var(--f1-red)] text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              {s === "top5" ? "Top 5" : s}
            </button>
          ))}
        </div>
      </div>

      {driverSet === "custom" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {allCodes.map((code) => (
            <button
              key={code}
              onClick={() => toggleCustom(code)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                customCodes.includes(code) ? "bg-[var(--f1-red)] text-white" : "bg-black/20 text-neutral-400 hover:text-white"
              }`}
            >
              {labelFor(code)}
            </button>
          ))}
        </div>
      )}

      {activeCodes.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          {driverSet === "following" ? "No favorites picked yet — mark one in the standings above." : "Pick at least one to plot."}
        </p>
      ) : (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
              <defs>
                {activeCodes.map((code, i) => (
                  <linearGradient key={code} id={`progression-fill-${code}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={chart.gridline} vertical={false} />
              <XAxis dataKey="trackShort" tick={{ fill: chart.mutedInk, fontSize: 11 }} axisLine={{ stroke: chart.gridline }} tickLine={false} interval="preserveStartEnd" />
              <YAxis reversed={metric === "gap"} tick={{ fill: chart.mutedInk, fontSize: 12 }} axisLine={{ stroke: chart.gridline }} tickLine={false} width={36} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, payload) => payload?.[0]?.payload?.raceName ?? ""} />
              {activeCodes.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: chart.mutedInk }} />}
              {activeCodes.map((code, i) => (
                <Area
                  key={code}
                  type="monotone"
                  dataKey={code}
                  name={labelFor(code)}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  fill={`url(#progression-fill-${code})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  animationDuration={700}
                  animationEasing="ease-out"
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
