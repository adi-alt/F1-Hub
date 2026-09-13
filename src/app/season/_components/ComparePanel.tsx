"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { teamColor } from "@/lib/teamColors";
import { useFavDriverIds, useFavTeamIds } from "@/queries/favorites/useFavorites";
import { EntityMultiSelect, type MultiSelectOption } from "./EntityMultiSelect";
import { CompareIntelligence } from "./CompareIntelligence";
import { useSeasonExplorer } from "../_context/SeasonExplorerContext";
import { buildComparePair, tugPct, type ComparePair, type ConstructorStandingRow, type DriverStandingRow, type RaceSummary } from "../_service/season.pure";

/**
 * Driver-vs-driver or team-vs-team.
 *
 * Reading order, top to bottom: who you picked, what the headline number is, what Apex makes of
 * it, then the supporting metrics, then head-to-head, then race-by-race. The previous version put
 * AI output above the scoreboard and gave every metric a full-width bar, which buried the one
 * comparison people actually come here for under a stack of identical bars.
 *
 * Crucially, everything except the Apex block is computed with `buildComparePair` — the SAME pure
 * function the server uses to build the model's context. The numbers on screen and the numbers in
 * the prompt are not two implementations that happen to agree; they are one.
 */
export function ComparePanel({
  season,
  drivers,
  constructors,
  raceSummaries,
}: {
  season: number;
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  raceSummaries: RaceSummary[];
}) {
  const { entityType, compareA, compareB, setCompareA, setCompareB } = useSeasonExplorer();
  const favDrivers = useFavDriverIds();
  const favTeams = useFavTeamIds();
  const isDrivers = entityType === "drivers";
  const scrollRef = useNestedLenisScroll(`${compareA}-${compareB}`);

  const options: MultiSelectOption[] = useMemo(
    () =>
      isDrivers
        ? drivers.map((d) => ({ code: d.driver, label: d.driverName, sublabel: d.driver, group: d.team, color: teamColor(d.team) }))
        : constructors.map((c) => ({ code: c.team, label: c.team, logoUrl: c.logoUrl })),
    [isDrivers, drivers, constructors],
  );

  const favoriteCodes = useMemo(
    () =>
      new Set(
        isDrivers
          ? drivers.filter((d) => d.favoriteId && favDrivers.has(d.favoriteId)).map((d) => d.driver)
          : constructors.filter((c) => favTeams.has(c.favoriteId)).map((c) => c.team),
      ),
    [isDrivers, drivers, constructors, favDrivers, favTeams],
  );

  const pair = useMemo(
    () => buildComparePair(season, entityType, compareA, compareB, drivers, constructors, raceSummaries),
    [season, entityType, compareA, compareB, drivers, constructors, raceSummaries],
  );

  const picker = (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-3">
      <EntityMultiSelect
        multiple={false}
        options={options}
        selected={compareA ? [compareA] : []}
        onChange={(codes) => setCompareA(codes[0] ?? "")}
        favoriteCodes={favoriteCodes}
        placeholder={isDrivers ? "Driver A" : "Team A"}
      />
      <span aria-hidden className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-600 sm:block">
        vs
      </span>
      <EntityMultiSelect
        multiple={false}
        options={options}
        selected={compareB ? [compareB] : []}
        onChange={(codes) => setCompareB(codes[0] ?? "")}
        favoriteCodes={favoriteCodes}
        placeholder={isDrivers ? "Driver B" : "Team B"}
      />
    </div>
  );

  if (!pair) {
    return (
      <div className="flex min-h-[200px] flex-col justify-center gap-4">
        {picker}
        <p className="text-center text-sm text-neutral-500">Pick two {isDrivers ? "drivers" : "teams"} to compare.</p>
      </div>
    );
  }

  return (
    <div>
      {picker}

      {/* 2. What is being compared, stated before anything is claimed about it. */}
      <div className="mt-5 text-center">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
          {pair.a.name} <span className="text-neutral-600">vs</span> {pair.b.name}
        </h3>
        <p className="mt-0.5 text-[11px] text-neutral-600">
          {isDrivers ? "Drivers' championship" : "Constructors' championship"} · {season} season · {pair.completedRounds} round
          {pair.completedRounds === 1 ? "" : "s"} completed
        </p>
      </div>

      {/* 3. The deterministic scoreboard. Rendered immediately, never waits on the model. */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 sm:gap-5">
        <Score name={pair.a.name} value={pair.a.points} leading={pair.aheadId === pair.a.id} align="right" />
        <div className="pb-1 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600">pts</p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-neutral-500">{pair.pointsGap === 0 ? "level" : `+${pair.pointsGap}`}</p>
        </div>
        <Score name={pair.b.name} value={pair.b.points} leading={pair.aheadId === pair.b.id} align="left" />
      </div>

      {/* 4. Apex. Its own loading state, below the facts, never blocking them. */}
      <div className="mt-6">
        <CompareIntelligence
          season={season}
          entityType={entityType}
          entityA={pair.a.id}
          entityB={pair.b.id}
          aName={pair.a.name}
          bName={pair.b.name}
        />
      </div>

      {/* 5. Supporting metrics. Bars only where proportion genuinely reads. */}
      <MetricRows pair={pair} />

      {/* 6. Head-to-head, explicitly separated because it is a different metric. */}
      <HeadToHead pair={pair} />

      {/* 7. Race-by-race. */}
      {pair.raceByRace.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Race by race · finishing position</p>
          <div ref={scrollRef} className="max-h-56 overflow-y-auto rounded-md border border-white/[0.07] scrollbar-hide">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Finishing position for {pair.a.name} and {pair.b.name} in each completed round
              </caption>
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] text-[10px] uppercase tracking-wide text-neutral-500 backdrop-blur-md" style={{ background: "var(--tooltip-surface-strong)" }}>
                <tr>
                  <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                    Round
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-center font-semibold">
                    {pair.a.name}
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-center font-semibold">
                    {pair.b.name}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.055]">
                {pair.raceByRace.map((r) => (
                  <tr key={r.round}>
                    <td className="px-3 py-1.5 text-neutral-400">{r.trackShort}</td>
                    <PositionCell mine={r.aPos} theirs={r.bPos} />
                    <PositionCell mine={r.bPos} theirs={r.aPos} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Score({ name, value, leading, align }: { name: string; value: number; leading: boolean; align: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-500">{name}</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={`${name}-${value}`}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={`mt-0.5 font-mono text-[28px] font-bold leading-none tabular-nums sm:text-[34px] ${leading ? "text-white" : "text-neutral-400"}`}
        >
          {value}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function PositionCell({ mine, theirs }: { mine: number | null; theirs: number | null }) {
  const ahead = mine !== null && theirs !== null && mine < theirs;
  return <td className={`px-3 py-1.5 text-center font-mono tabular-nums ${ahead ? "font-semibold text-white" : "text-neutral-400"}`}>{mine ?? "—"}</td>;
}

/** Counting stats get a proportional bar, because "7 against 2" reads instantly as a ratio.
 * Average finish and retirements deliberately don't: lower is better for both, so a proportional
 * bar would visually award the bar to whoever is actually worse. */
function MetricRows({ pair }: { pair: ComparePair }) {
  const { a, b } = pair;
  const bars: { label: string; av: number; bv: number; aText: string; bText: string }[] = [
    { label: "Wins", av: a.wins, bv: b.wins, aText: String(a.wins), bText: String(b.wins) },
    { label: "Podiums", av: a.podiums, bv: b.podiums, aText: String(a.podiums), bText: String(b.podiums) },
  ];
  if (a.poles !== null && b.poles !== null) bars.push({ label: "Poles", av: a.poles, bv: b.poles, aText: String(a.poles), bText: String(b.poles) });
  bars.push({
    label: "Points per round",
    av: a.pointsPerRace ?? 0,
    bv: b.pointsPerRace ?? 0,
    aText: a.pointsPerRace !== null ? a.pointsPerRace.toFixed(1) : "—",
    bText: b.pointsPerRace !== null ? b.pointsPerRace.toFixed(1) : "—",
  });

  const plain: { label: string; aText: string; bText: string; aWins: boolean; bWins: boolean }[] = [
    {
      label: "Avg finish",
      aText: a.averageFinish !== null ? `P${a.averageFinish.toFixed(1)}` : "—",
      bText: b.averageFinish !== null ? `P${b.averageFinish.toFixed(1)}` : "—",
      aWins: a.averageFinish !== null && b.averageFinish !== null && a.averageFinish < b.averageFinish,
      bWins: a.averageFinish !== null && b.averageFinish !== null && b.averageFinish < a.averageFinish,
    },
    { label: "Retirements", aText: String(a.dnfs), bText: String(b.dnfs), aWins: a.dnfs < b.dnfs, bWins: b.dnfs < a.dnfs },
  ];

  return (
    <div className="mt-1 divide-y divide-white/[0.055] border-y border-white/[0.055]">
      {bars.map((row) => {
        const [aPct, bPct] = tugPct(row.av, row.bv);
        return (
          <div key={row.label} className="py-2.5">
            <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{row.label}</p>
            <div className="flex items-center gap-3">
              <span className={`w-12 shrink-0 text-right font-mono text-sm tabular-nums ${row.av > row.bv ? "font-bold text-white" : "text-neutral-400"}`}>{row.aText}</span>
              <div className="flex flex-1 items-center gap-1">
                <div className="flex h-[5px] flex-1 justify-end overflow-hidden rounded-l-full bg-white/[0.05]">
                  <motion.div className="h-full rounded-l-full" initial={false} animate={{ width: `${aPct}%` }} transition={{ duration: 0.3, ease: "easeOut" }} style={{ background: "linear-gradient(90deg, rgba(225,6,0,0.5), var(--f1-red))" }} />
                </div>
                <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-white/25" />
                <div className="flex h-[5px] flex-1 overflow-hidden rounded-r-full bg-white/[0.05]">
                  <motion.div className="h-full rounded-r-full" initial={false} animate={{ width: `${bPct}%` }} transition={{ duration: 0.3, ease: "easeOut" }} style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.42), rgba(255,255,255,0.14))" }} />
                </div>
              </div>
              <span className={`w-12 shrink-0 text-left font-mono text-sm tabular-nums ${row.bv > row.av ? "font-bold text-white" : "text-neutral-400"}`}>{row.bText}</span>
            </div>
          </div>
        );
      })}
      {plain.map((row) => (
        <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5">
          <span className={`text-right font-mono text-sm tabular-nums ${row.aWins ? "font-bold text-white" : "text-neutral-400"}`}>{row.aText}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{row.label}</span>
          <span className={`text-left font-mono text-sm tabular-nums ${row.bWins ? "font-bold text-white" : "text-neutral-400"}`}>{row.bText}</span>
        </div>
      ))}
    </div>
  );
}

/** Named, separated, and never blended into the points comparison above — the two answer
 * different questions and a reader must be able to tell which one a number belongs to. */
function HeadToHead({ pair }: { pair: ComparePair }) {
  const { h2h, a, b } = pair;
  if (h2h.comparableRounds === 0) return null;

  return (
    <div className="mt-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        Head to head <span className="font-normal normal-case tracking-normal text-neutral-600">· who finished ahead, by race classification</span>
      </p>
      <div className="mt-2.5 grid grid-cols-3 items-baseline gap-2 border-y border-white/[0.055] py-3">
        <div className="text-right">
          <p className="font-mono text-2xl font-bold tabular-nums text-white">{h2h.aWins}</p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-500">{a.name}</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-lg font-semibold tabular-nums text-neutral-500">{h2h.ties}</p>
          <p className="mt-0.5 text-[11px] text-neutral-600">dead heats</p>
        </div>
        <div className="text-left">
          <p className="font-mono text-2xl font-bold tabular-nums text-white">{h2h.bWins}</p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-500">{b.name}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-neutral-600">
        Across {h2h.comparableRounds} round{h2h.comparableRounds === 1 ? "" : "s"} where both were classified
        {h2h.excludedRounds > 0 && `, with ${h2h.excludedRounds} round${h2h.excludedRounds === 1 ? "" : "s"} excluded because one of them had no result`}
        {h2h.isTeammates && " · teammates"}.
      </p>
    </div>
  );
}
