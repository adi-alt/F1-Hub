"use client";

import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { averageFinish, dnfCount, driverResults, poleCount, pointsPerRace, teamResults } from "../lib/seasonStats";
import { useSeasonExplorer } from "./SeasonExplorerContext";
import type { ConstructorStandingRow, DriverStandingRow, RaceSummary } from "../services/season.service";

const SELECT_CLASS = "w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white";

type StatRow = { label: string; av: number; bv: number; aText: string; bText: string; lowerIsBetter?: boolean };

/** Winner's bar always reads full-length; the trailing side's bar is drawn to scale against it —
 * "who's ahead, and by how much" as a glance, not a number you have to read and compare yourself. */
function tugPct(av: number, bv: number): [number, number] {
  if (av <= 0 && bv <= 0) return [0, 0];
  if (av >= bv) return [100, av === 0 ? 0 : Math.round((bv / av) * 100)];
  return [bv === 0 ? 0 : Math.round((av / bv) * 100), 100];
}

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
            <div className="h-full rounded-l-full bg-[var(--f1-red)] transition-all duration-300" style={{ width: `${aPct}%` }} />
          </div>
          <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
          <div className="flex h-1.5 flex-1 overflow-hidden rounded-r-full bg-white/[0.05]">
            <div className="h-full rounded-r-full bg-white/35 transition-all duration-300" style={{ width: `${bPct}%` }} />
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
  const isDrivers = entityType === "drivers";

  const options: SearchableOption[] = isDrivers
    ? drivers.map((d) => ({ value: d.driver, label: d.driverName }))
    : constructors.map((c) => ({ value: c.team, label: c.team }));

  const a = isDrivers ? drivers.find((d) => d.driver === compareA) : constructors.find((c) => c.team === compareA);
  const b = isDrivers ? drivers.find((d) => d.driver === compareB) : constructors.find((c) => c.team === compareB);
  const aName = isDrivers ? (a as DriverStandingRow | undefined)?.driverName ?? compareA : compareA;
  const bName = isDrivers ? (b as DriverStandingRow | undefined)?.driverName ?? compareB : compareB;

  const picker = (
    <div className="flex items-center gap-2">
      <SearchableSelect value={compareA} onChange={setCompareA} options={options} placeholder={isDrivers ? "Driver A" : "Team A"} className={SELECT_CLASS} />
      <span className="text-xs text-neutral-600">vs</span>
      <SearchableSelect value={compareB} onChange={setCompareB} options={options} placeholder={isDrivers ? "Driver B" : "Team B"} className={SELECT_CLASS} />
    </div>
  );

  if (!a || !b) {
    return (
      <div className="flex h-full flex-col justify-center gap-4">
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
    aText: pprA !== null ? pprA.toFixed(1) : "—",
    bText: pprB !== null ? pprB.toFixed(1) : "—",
  });

  const plainRows: StatRow[] = [
    { label: "Avg finish", av: avgA ?? 99, bv: avgB ?? 99, aText: avgA !== null ? `P${avgA.toFixed(1)}` : "—", bText: avgB !== null ? `P${avgB.toFixed(1)}` : "—" },
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

      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-end gap-4">
        <div className="text-right">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">{aName}</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-white">{a.points}</p>
        </div>
        <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-600">vs</p>
        <div className="text-left">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">{bName}</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-white">{b.points}</p>
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
          <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 scrollbar-hide">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--f1-carbon)] text-[10px] uppercase tracking-wide text-neutral-500">
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
                      {r.aPos ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-center font-mono tabular-nums ${
                        r.aPos !== undefined && r.bPos !== undefined && r.bPos < r.aPos ? "font-semibold text-white" : "text-neutral-400"
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
