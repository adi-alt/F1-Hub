"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { teamColor } from "@/lib/teamColors";
import { useFavDriverIds, useFavTeamIds } from "@/queries/favorites/useFavorites";
import { averageFinish, dnfCount, driverResults, poleCount, pointsPerRace, teamResults, tugPct } from "../_utils/seasonStats";
import { EntityMultiSelect, type MultiSelectOption } from "./EntityMultiSelect";
import { useSeasonExplorer } from "../_context/SeasonExplorerContext";
import type { ConstructorStandingRow, DriverStandingRow, RaceSummary } from "../_service/season.service";

type StatRow = { label: string; av: number; bv: number; aText: string; bText: string; lowerIsBetter?: boolean };

function TugRow({ row }: { row: StatRow }) {
  const { label, av, bv, aText, bText } = row;
  const [aPct, bPct] = tugPct(av, bv);
  const aWins = av > bv;
  const bWins = bv > av;
  return (
    <div className="py-2.5">
      <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{label}</p>
      <div className="flex items-center gap-3">
        <span className={`w-12 shrink-0 text-right font-mono text-sm tabular-nums ${aWins ? "font-bold text-white" : "text-neutral-400"}`}>{aText}</span>
        <div className="flex flex-1 items-center gap-1">
          <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-l-full bg-white/[0.05]">
            <motion.div
              className="h-full rounded-l-full"
              initial={false}
              animate={{ width: `${aPct}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ background: "linear-gradient(90deg, rgba(225,6,0,0.55), var(--f1-red))", boxShadow: aPct > 0 ? "0 0 4px rgba(225,6,0,0.35)" : undefined }}
            />
          </div>
          <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
          <div className="flex h-1.5 flex-1 overflow-hidden rounded-r-full bg-white/[0.05]">
            <motion.div
              className="h-full rounded-r-full"
              initial={false}
              animate={{ width: `${bPct}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.45), rgba(255,255,255,0.15))" }}
            />
          </div>
        </div>
        <span className={`w-12 shrink-0 text-left font-mono text-sm tabular-nums ${bWins ? "font-bold text-white" : "text-neutral-400"}`}>{bText}</span>
      </div>
    </div>
  );
}

// Avg finish / DNFs are "lower is better" — a proportional bar would visually contradict who's
// actually ahead, so these get emphasis-only rows instead of a tug bar.
function PlainRow({ row }: { row: StatRow }) {
  const { label, av, bv, aText, bText } = row;
  const aWins = av < bv;
  const bWins = bv < av;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5">
      <span className={`text-right font-mono text-sm tabular-nums ${aWins ? "font-bold text-white" : "text-neutral-400"}`}>{aText}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{label}</span>
      <span className={`text-left font-mono text-sm tabular-nums ${bWins ? "font-bold text-white" : "text-neutral-400"}`}>{bText}</span>
    </div>
  );
}

/** Driver-vs-driver or team-vs-team, whichever the standings' quiet-tab switch currently has
 * active — a central-axis head-to-head (hero points, then tug-of-war stat bars, then a race-by-
 * race breakdown) instead of two flat columns side by side. */
export function ComparePanel({
  drivers,
  constructors,
  raceSummaries,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  raceSummaries: RaceSummary[];
}) {
  const { entityType, compareA, compareB, setCompareA, setCompareB } = useSeasonExplorer();
  const favDrivers = useFavDriverIds();
  const favTeams = useFavTeamIds();
  const isDrivers = entityType === "drivers";
  // Without this, a wheel scroll inside the race-by-race table also drags the whole page's own
  // Lenis scroll along with it - the same nested-region registration ChampionshipStandings'
  // table already uses, so this table's own scroll stays contained to itself.
  const scrollRef = useNestedLenisScroll(`${compareA}-${compareB}`);

  // Same option shape (grouped by team, real team color/logo) and the same "Favorites" grouping
  // Progression's Custom multi-select uses - one visual/data language for every entity picker in
  // this workspace instead of Compare's own plainer text-input combobox.
  const options: MultiSelectOption[] = isDrivers
    ? drivers.map((d) => ({ code: d.driver, label: d.driverName, sublabel: d.driver, group: d.team, color: teamColor(d.team) }))
    : constructors.map((c) => ({ code: c.team, label: c.team, logoUrl: c.logoUrl }));
  const favoriteCodes = isDrivers
    ? new Set(drivers.filter((d) => d.favoriteId && favDrivers.has(d.favoriteId)).map((d) => d.driver))
    : new Set(constructors.filter((c) => favTeams.has(c.favoriteId)).map((c) => c.team));

  const a = isDrivers ? drivers.find((d) => d.driver === compareA) : constructors.find((c) => c.team === compareA);
  const b = isDrivers ? drivers.find((d) => d.driver === compareB) : constructors.find((c) => c.team === compareB);
  const aName = isDrivers ? (a as DriverStandingRow | undefined)?.driverName ?? compareA : compareA;
  const bName = isDrivers ? (b as DriverStandingRow | undefined)?.driverName ?? compareB : compareB;

  const picker = (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <EntityMultiSelect
        multiple={false}
        options={options}
        selected={compareA ? [compareA] : []}
        onChange={(codes) => setCompareA(codes[0] ?? "")}
        favoriteCodes={favoriteCodes}
        placeholder={isDrivers ? "Driver A" : "Team A"}
      />
      <span className="text-xs text-neutral-600">vs</span>
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

  if (!a || !b) {
    return (
      <div className="flex min-h-[180px] flex-col justify-center gap-4">
        {picker}
        <p className="text-center text-sm text-neutral-500">Pick two to compare.</p>
      </div>
    );
  }

  const resultsA = isDrivers ? driverResults(raceSummaries, compareA) : teamResults(raceSummaries, compareA);
  const resultsB = isDrivers ? driverResults(raceSummaries, compareB) : teamResults(raceSummaries, compareB);
  const avgA = averageFinish(resultsA);
  const avgB = averageFinish(resultsB);
  const pprA = pointsPerRace(a.points, resultsA);
  const pprB = pointsPerRace(b.points, resultsB);
  const polesA = isDrivers ? poleCount(raceSummaries, compareA) : null;
  const polesB = isDrivers ? poleCount(raceSummaries, compareB) : null;
  const dnfA = dnfCount(resultsA);
  const dnfB = dnfCount(resultsB);

  const barRows: StatRow[] = [
    { label: "Wins", av: a.wins, bv: b.wins, aText: String(a.wins), bText: String(b.wins) },
    { label: "Podiums", av: a.podiums, bv: b.podiums, aText: String(a.podiums), bText: String(b.podiums) },
  ];
  if (polesA !== null && polesB !== null) barRows.push({ label: "Poles", av: polesA, bv: polesB, aText: String(polesA), bText: String(polesB) });
  barRows.push({
    label: "Points / race",
    av: pprA ?? 0,
    bv: pprB ?? 0,
    aText: pprA !== null ? pprA.toFixed(1) : "-",
    bText: pprB !== null ? pprB.toFixed(1) : "-",
  });

  const plainRows: StatRow[] = [
    { label: "Avg finish", av: avgA ?? 99, bv: avgB ?? 99, aText: avgA !== null ? `P${avgA.toFixed(1)}` : "-", bText: avgB !== null ? `P${avgB.toFixed(1)}` : "-" },
    { label: "DNFs", av: dnfA, bv: dnfB, aText: String(dnfA), bText: String(dnfB) },
  ];

  const rounds = [...new Set([...resultsA.map((r) => r.round), ...resultsB.map((r) => r.round)])].sort((x, y) => x - y);
  const raceRows = rounds.map((round) => {
    const ra = resultsA.find((r) => r.round === round);
    const rb = resultsB.find((r) => r.round === round);
    return { round, trackShort: ra?.trackShort ?? rb?.trackShort ?? "", aPos: ra?.position, bPos: rb?.position };
  });

  return (
    <div>
      {picker}

      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-end gap-4 overflow-hidden">
        <div className="text-right">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">{aName}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`${compareA}-${a.points}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mt-1 font-mono text-3xl font-bold tabular-nums text-white"
            >
              {a.points}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-600">vs</p>
        <div className="text-left">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">{bName}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`${compareB}-${b.points}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mt-1 font-mono text-3xl font-bold tabular-nums text-white"
            >
              {b.points}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-5 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {barRows.map((row) => (
          <TugRow key={row.label} row={row} />
        ))}
        {plainRows.map((row) => (
          <PlainRow key={row.label} row={row} />
        ))}
      </div>

      {raceRows.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Race-by-race finishing position</p>
          <div ref={scrollRef} className="max-h-56 overflow-y-auto rounded-lg border border-white/10 scrollbar-hide">
            <table className="w-full text-sm">
              <thead
                className="sticky top-0 z-10 border-b border-white/[0.08] text-[10px] uppercase tracking-wide text-neutral-500 backdrop-blur-md"
                style={{ background: "var(--tooltip-surface-strong)" }}
              >
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold">Race</th>
                  <th className="px-3 py-1.5 text-center font-semibold">{aName}</th>
                  <th className="px-3 py-1.5 text-center font-semibold">{bName}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {raceRows.map((r) => (
                  <tr key={r.round}>
                    <td className="px-3 py-1.5 text-neutral-400">{r.trackShort}</td>
                    <td
                      className={`px-3 py-1.5 text-center font-mono tabular-nums ${
                        r.aPos !== undefined && r.bPos !== undefined && r.aPos < r.bPos ? "font-semibold text-white" : "text-neutral-400"
                      }`}
                    >
                      {r.aPos ?? "-"}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-center font-mono tabular-nums ${
                        r.aPos !== undefined && r.bPos !== undefined && r.bPos < r.aPos ? "font-semibold text-white" : "text-neutral-400"
                      }`}
                    >
                      {r.bPos ?? "-"}
                    </td>
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
