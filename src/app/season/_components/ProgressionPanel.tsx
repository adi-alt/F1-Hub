"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { teamColor } from "@/lib/teamColors";
import { useFavDriverIds, useFavTeamIds } from "@/queries/favorites/useFavorites";
import { EntityMultiSelect, type MultiSelectOption } from "./EntityMultiSelect";
import { QuietTabs } from "./QuietTabs";
import { useSeasonExplorer } from "../_context/SeasonExplorerContext";
import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";
import { SparklesIcon } from "lucide-react";
import type { ConstructorStandingRow, DriverStandingRow } from "../_service/season.service";

type Metric = "points" | "gap";
type DriverSet = "top5" | "following" | "custom";

const ChampionshipTrajectory = dynamic(() => import("@/components/charts/ChampionshipTrajectory"), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl bg-white/[0.02]" />,
});

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
  progression: Record<string, number | string | null>[];
}) {
  const { entityType, highlightRound } = useSeasonExplorer();
  const { intelligence } = useSeasonIntelligence();
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
  const teamProgression = useMemo((): Record<string, number | string | null>[] => {
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
      const out: Record<string, number | string | null> = { round: row.round, raceName: row.raceName, trackShort: row.trackShort };
      for (const code of activeCodes) {
        const v = row[code];
        out[code] = typeof v === "number" ? leaderValue - v : 0;
      }
      return out;
    });
  }, [metric, teamProgression, leaderCode, activeCodes]);

  const highlightTrack = useMemo(() => {
    if (highlightRound == null) return null;
    const track = chartData.find((row) => row.round === highlightRound)?.trackShort;
    return typeof track === "string" ? track : null;
  }, [chartData, highlightRound]);

  if (allCodes.length === 0) {
    return <div className="flex min-h-[180px] items-center justify-center text-sm text-neutral-500">No {isDrivers ? "driver" : "constructor"} has scored yet this season.</div>;
  }

  return (
    <div>
      {intelligence?.progressionInsight && (
        <div className="mb-6 p-4 rounded-xl bg-[var(--f1-accent)]/10 border border-[var(--f1-accent)]/20">
          <div className="flex items-center gap-2 mb-2">
            <SparklesIcon className="w-4 h-4 text-[var(--f1-accent)]" />
            <h4 className="font-bold text-[var(--f1-text)] text-sm uppercase">{intelligence.progressionInsight.headline}</h4>
          </div>
          <p className="text-sm text-[var(--f1-text-muted)]">{intelligence.progressionInsight.summary}</p>
        </div>
      )}
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
            <ChampionshipTrajectory
              chartData={chartData}
              curves={curves}
              metric={metric}
              labelFor={labelFor}
              highlightTrack={highlightTrack}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
