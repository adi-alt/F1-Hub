"use client";

import { Fragment } from "react";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { averageFinish, dnfCount, driverResults, poleCount, pointsPerRace, teamResults } from "../lib/seasonStats";
import { useSeasonExplorer } from "./SeasonExplorerContext";
import type { ConstructorStandingRow, DriverStandingRow, RaceSummary } from "../services/season.service";

const SELECT_CLASS = "w-full rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-3 py-2 text-sm text-white";

/** Driver-vs-driver or team-vs-team, whichever the standings' segmented control currently has
 * active — replaces the old permanent Head-to-Head sidebar; same idea, now with real stats
 * (avg finish, points/race, DNFs, poles) and a race-by-race breakdown instead of just Points/
 * Wins/Podiums. */
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
  const isDrivers = entityType === "drivers";

  const options: SearchableOption[] = isDrivers
    ? drivers.map((d) => ({ value: d.driver, label: d.driverName }))
    : constructors.map((c) => ({ value: c.team, label: c.team }));

  const a = isDrivers ? drivers.find((d) => d.driver === compareA) : constructors.find((c) => c.team === compareA);
  const b = isDrivers ? drivers.find((d) => d.driver === compareB) : constructors.find((c) => c.team === compareB);
  const aLabel = isDrivers ? compareA : compareA.slice(0, 3).toUpperCase();
  const bLabel = isDrivers ? compareB : compareB.slice(0, 3).toUpperCase();

  if (!a || !b) {
    return (
      <div className="flex items-center gap-2">
        <SearchableSelect value={compareA} onChange={setCompareA} options={options} placeholder={isDrivers ? "Driver A" : "Team A"} className={SELECT_CLASS} />
        <span className="text-xs text-neutral-500">vs</span>
        <SearchableSelect value={compareB} onChange={setCompareB} options={options} placeholder={isDrivers ? "Driver B" : "Team B"} className={SELECT_CLASS} />
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

  const rounds = [...new Set([...resultsA.map((r) => r.round), ...resultsB.map((r) => r.round)])].sort((x, y) => x - y);
  const raceRows = rounds.map((round) => {
    const ra = resultsA.find((r) => r.round === round);
    const rb = resultsB.find((r) => r.round === round);
    return { round, trackShort: ra?.trackShort ?? rb?.trackShort ?? "", aPos: ra?.position, bPos: rb?.position };
  });

  const statRows: [string, number | string, number | string][] = [
    ["Points", a.points, b.points],
    ["Wins", a.wins, b.wins],
    ["Podiums", a.podiums, b.podiums],
    ["Avg finish", avgA !== null ? `P${avgA.toFixed(1)}` : "—", avgB !== null ? `P${avgB.toFixed(1)}` : "—"],
    ["Points / race", pprA !== null ? pprA.toFixed(1) : "—", pprB !== null ? pprB.toFixed(1) : "—"],
    ["DNFs", dnfCount(resultsA), dnfCount(resultsB)],
  ];
  if (polesA !== null && polesB !== null) statRows.splice(3, 0, ["Poles", polesA, polesB]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <SearchableSelect value={compareA} onChange={setCompareA} options={options} placeholder={isDrivers ? "Driver A" : "Team A"} className={SELECT_CLASS} />
        <span className="text-xs text-neutral-500">vs</span>
        <SearchableSelect value={compareB} onChange={setCompareB} options={options} placeholder={isDrivers ? "Driver B" : "Team B"} className={SELECT_CLASS} />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_5rem_5rem] gap-y-2 text-sm">
        <span />
        <span className="text-center text-xs uppercase tracking-wide text-neutral-500">{aLabel}</span>
        <span className="text-center text-xs uppercase tracking-wide text-neutral-500">{bLabel}</span>
        {statRows.map(([label, av, bv]) => (
          <Fragment key={label}>
            <span className="py-1 text-neutral-400">{label}</span>
            <span className={`py-1 text-center font-mono tabular-nums ${Number(av) > Number(bv) ? "font-semibold text-[var(--f1-red)]" : "text-white"}`}>{av}</span>
            <span className={`py-1 text-center font-mono tabular-nums ${Number(bv) > Number(av) ? "font-semibold text-[var(--f1-red)]" : "text-white"}`}>{bv}</span>
          </Fragment>
        ))}
      </div>

      {raceRows.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-neutral-500">Race-by-race finishing position</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--f1-line)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--f1-carbon)] text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-1.5 text-left">Race</th>
                  <th className="px-3 py-1.5 text-center">{aLabel}</th>
                  <th className="px-3 py-1.5 text-center">{bLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--f1-line)]">
                {raceRows.map((r) => (
                  <tr key={r.round}>
                    <td className="px-3 py-1.5 text-neutral-300">{r.trackShort}</td>
                    <td
                      className={`px-3 py-1.5 text-center font-mono tabular-nums ${
                        r.aPos !== undefined && r.bPos !== undefined && r.aPos < r.bPos ? "font-semibold text-[var(--f1-red)]" : "text-white"
                      }`}
                    >
                      {r.aPos ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-center font-mono tabular-nums ${
                        r.aPos !== undefined && r.bPos !== undefined && r.bPos < r.aPos ? "font-semibold text-[var(--f1-red)]" : "text-white"
                      }`}
                    >
                      {r.bPos ?? "—"}
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

