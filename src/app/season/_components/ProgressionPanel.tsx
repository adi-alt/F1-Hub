"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { teamColor } from "@/lib/teamColors";
import { useFavDriverIds, useFavTeamIds } from "@/queries/favorites/useFavorites";
import { EntityMultiSelect, type MultiSelectOption } from "./EntityMultiSelect";
import { QuietTabs } from "./QuietTabs";
import { useSeasonExplorer } from "../_context/SeasonExplorerContext";
import type { ConstructorStandingRow, DriverStandingRow } from "../_service/season.service";

type Metric = "points" | "gap";
type DriverSet = "top5" | "following" | "custom";
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

/** One chart, driven by two small controls (metric, driver-set) instead of several separate
 * charts — switching Drivers/Constructors on the standings above updates who this plots, without
 * a different UI. Team progression is derived client-side (sum of that team's drivers' cumulative
 * points per round) rather than a second server fetch, since the per-driver data already covers it.
 * Curves use each driver/team's real team color (teammates sharing a color get a dashed line to
 * stay distinguishable) instead of an arbitrary rainbow palette. */
export function ProgressionPanel({
  drivers,
  constructors,
  progression,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string>[];
}) {
  const { entityType, highlightRound } = useSeasonExplorer();
  const favDrivers = useFavDriverIds();
  const favTeams = useFavTeamIds();
  const [metric, setMetric] = useState<Metric>("points");
  const [driverSet, setDriverSet] = useState<DriverSet>("top5");
  const [customCodes, setCustomCodes] = useState<string[]>([]);
  // Hovering a curve (or its legend entry) emphasizes it and dims the rest — null means "show
  // everything at full strength", the resting state.
  const [activeCode, setActiveCode] = useState<string | null>(null);
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
  const teamOf = (code: string) => (isDrivers ? drivers.find((d) => d.driver === code)?.team ?? code : code);

  // Which entity codes are favorited, in *this* code space (season driver code / team name) -
  // favDrivers/favTeams are archive-id sets, matched here the same way ChampionshipStandings does
  // per row. Shared by "Following" mode and the Custom multi-select's "Favorites" grouping, rather
  // than each recomputing its own version of the same lookup.
  const favoriteEntityCodes = useMemo(
    () =>
      new Set(
        isDrivers
          ? drivers.filter((d) => d.favoriteId && favDrivers.has(d.favoriteId)).map((d) => d.driver)
          : constructors.filter((c) => favTeams.has(c.favoriteId)).map((c) => c.team),
      ),
    [isDrivers, drivers, constructors, favDrivers, favTeams],
  );

  const activeCodes = useMemo(() => {
    if (driverSet === "top5") return (isDrivers ? drivers : constructors).slice(0, 5).map((x) => (isDrivers ? (x as DriverStandingRow).driver : (x as ConstructorStandingRow).team));
    if (driverSet === "following") return [...favoriteEntityCodes];
    return customCodes;
  }, [driverSet, isDrivers, drivers, constructors, favoriteEntityCodes, customCodes]);

  // Options for the Custom-mode multi-select: drivers group by team (sublabel shows the driver's
  // own code, since the team already reads as the group heading); constructors are a flat list
  // with their real logo where fetch_races.py has one.
  const multiSelectOptions: MultiSelectOption[] = useMemo(
    () =>
      isDrivers
        ? drivers.filter((d) => d.points > 0).map((d) => ({ code: d.driver, label: d.driverName, sublabel: d.driver, group: d.team, color: teamColor(d.team) }))
        : constructors.filter((c) => c.points > 0).map((c) => ({ code: c.team, label: c.team, logoUrl: c.logoUrl })),
    [isDrivers, drivers, constructors],
  );

  // Real team color per curve, not an arbitrary index-based palette — teammates share a color, so
  // the second (and later) driver on the same team gets a dashed stroke to stay distinguishable.
  const seenColors = new Set<string>();
  const curves = activeCodes.map((code) => {
    const color = teamColor(teamOf(code));
    const dashed = seenColors.has(color);
    seenColors.add(color);
    return { code, color, dashed };
  });

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

  const highlightTrack = useMemo(() => {
    if (highlightRound == null) return null;
    return chartData.find((row) => row.round === highlightRound)?.trackShort ?? null;
  }, [chartData, highlightRound]);

  if (allCodes.length === 0) {
    return <div className="flex min-h-[180px] items-center justify-center text-sm text-neutral-500">No {isDrivers ? "driver" : "constructor"} has scored yet this season.</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <QuietTabs
          options={[
            { value: "points" as const, label: "Points" },
            { value: "gap" as const, label: "Gap to leader" },
          ]}
          value={metric}
          onChange={setMetric}
        />
        <QuietTabs
          options={[
            { value: "top5" as const, label: "Top 5" },
            { value: "following" as const, label: "Following" },
            { value: "custom" as const, label: "Custom" },
          ]}
          value={driverSet}
          onChange={setDriverSet}
        />
      </div>

      {driverSet === "custom" && (
        <div className="mt-3">
          <EntityMultiSelect
            options={multiSelectOptions}
            selected={customCodes}
            onChange={setCustomCodes}
            favoriteCodes={favoriteEntityCodes}
            placeholder={`Select ${isDrivers ? "drivers" : "teams"}`}
          />
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {activeCodes.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-4 flex min-h-[64px] items-center justify-center rounded-lg border border-dashed border-white/10 text-center text-sm text-neutral-500"
          >
            {driverSet === "following" ? "No favorites picked yet, mark one in the standings above." : "Pick at least one to plot."}
          </motion.div>
        ) : (
          <motion.div key="chart" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="mt-4">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
