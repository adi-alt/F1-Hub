"use client";

import { ComparePanel } from "./ComparePanel";
import { ProgressionPanel } from "./ProgressionPanel";
import { useSeasonExplorer, type AnalysisTab } from "./SeasonExplorerContext";
import type { Battle, ConstructorStandingRow, DriverStandingRow, RaceSummary, SeasonRecord } from "../services/season.service";

const TABS: { key: AnalysisTab; label: string }[] = [
  { key: "battles", label: "Battles" },
  { key: "compare", label: "Compare" },
  { key: "progression", label: "Progression" },
  { key: "records", label: "Records" },
];

/** The single workspace below the standings — one of four analyses shows at a time, swapped by
 * tab, instead of all four stacked one under another. This is what actually keeps the page from
 * turning into a long scroll: depth lives here, not in more sections. */
export function AnalysisWorkspace({
  battles,
  records,
  drivers,
  constructors,
  progression,
  raceSummaries,
}: {
  battles: Battle[];
  records: SeasonRecord[];
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string>[];
  raceSummaries: RaceSummary[];
}) {
  const { analysisTab, setAnalysisTab } = useSeasonExplorer();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--f1-line)] px-3 py-2">
        <p className="mr-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">Analysis</p>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setAnalysisTab(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              analysisTab === t.key ? "bg-[var(--f1-red)] text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[280px] p-4">
        {analysisTab === "battles" && <BattlesPanel battles={battles} />}
        {analysisTab === "compare" && <ComparePanel drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />}
        {analysisTab === "progression" && <ProgressionPanel drivers={drivers} constructors={constructors} progression={progression} />}
        {analysisTab === "records" && <RecordsPanel records={records} />}
      </div>
    </div>
  );
}

function BattlesPanel({ battles }: { battles: Battle[] }) {
  const { openCompare } = useSeasonExplorer();
  if (battles.length === 0) return <p className="text-sm text-neutral-500">No close battles yet — check back once more races are in.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {battles.map((b, i) => (
        <button
          key={i}
          onClick={() => openCompare(b.type, b.aId, b.bId)}
          className="rounded-lg border border-[var(--f1-line)] bg-black/20 p-3 text-left transition hover:border-white/30 hover:bg-black/30"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-white">{b.aLabel}</span>
            <span className="font-mono tabular-nums text-neutral-400">{b.aValue}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="font-medium text-white">{b.bLabel}</span>
            <span className="font-mono tabular-nums text-neutral-400">{b.bValue}</span>
          </div>
          <p className="mt-2 text-xs font-semibold text-[var(--f1-red)]">{b.gap === 0 ? "Tied" : `${b.gap} point${b.gap === 1 ? "" : "s"} apart`}</p>
        </button>
      ))}
    </div>
  );
}

function RecordsPanel({ records }: { records: SeasonRecord[] }) {
  if (records.length === 0) return <p className="text-sm text-neutral-500">Not enough races yet for season records.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {records.map((r, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-[var(--f1-line)] bg-black/20 p-3">
          <span className="text-xl" aria-hidden>
            {r.icon}
          </span>
          <div>
            <p className="text-xs text-neutral-500">{r.label}</p>
            <p className="text-sm font-medium text-white">{r.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
