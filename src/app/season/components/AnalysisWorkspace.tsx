"use client";

import { AnimatePresence, motion } from "framer-motion";
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

// Fixed content-area height, deliberately — every analysis mode renders into this same box so
// switching tabs never moves the page underneath the user (see spec: "analysis height must never
// change"). Taller-than-this content (Compare's race-by-race table, a long battle list) scrolls
// internally instead of growing the box.
const CONTENT_HEIGHT = "h-[460px]";

/** The single workspace below the standings — one of four analyses shows at a time, swapped by
 * an in-surface tab strip (sliding red underline, not pill buttons), with the content itself
 * crossfading in place rather than the container resizing. This is what actually keeps the page
 * from turning into a long scroll: depth lives here, not in more sections. */
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
    <div className="glass-surface overflow-hidden rounded-2xl">
      <div className="flex items-center gap-1 overflow-x-auto px-5 pt-4 scrollbar-hide">
        <p className="mr-4 shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Analysis</p>
        <nav className="flex shrink-0 items-center gap-6">
          {TABS.map((t) => {
            const active = analysisTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setAnalysisTab(t.key)}
                className={`relative shrink-0 pb-3 text-sm font-medium transition-colors duration-200 ${active ? "text-white" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                {t.label}
                {active && (
                  <motion.span layoutId="analysis-tab-underline" className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[var(--f1-red)]" transition={{ duration: 0.2, ease: "easeOut" }} />
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="border-b border-white/[0.07]" />

      <div className={`relative ${CONTENT_HEIGHT}`}>
        <AnimatePresence initial={false}>
          <motion.div
            key={analysisTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0 overflow-y-auto p-5 scrollbar-hide"
          >
            {analysisTab === "battles" && <BattlesPanel battles={battles} />}
            {analysisTab === "compare" && <ComparePanel drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />}
            {analysisTab === "progression" && <ProgressionPanel drivers={drivers} constructors={constructors} progression={progression} />}
            {analysisTab === "records" && <RecordsPanel records={records} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-neutral-500">{children}</div>;
}

/** Each battle rendered as a two-bar comparison (not a card) — bar length is each side's value
 * relative to the other, so the closer the fight the closer the two bars read; the tightest gap
 * overall (battles are pre-sorted tightest-first) gets the larger "lead" treatment, the rest sit
 * below as a compact list. Clicking any battle jumps straight into Compare with that pair loaded. */
function BattlesPanel({ battles }: { battles: Battle[] }) {
  const { openCompare } = useSeasonExplorer();
  if (battles.length === 0) return <EmptyState>No close battles yet — check back once more races are in.</EmptyState>;

  const [lead, ...rest] = battles;

  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Closest battle</p>
      <BattleBars battle={lead} onClick={() => openCompare(lead.type, lead.aId, lead.bId)} scale="lg" />

      {rest.length > 0 && (
        <div className="mt-6 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {rest.map((b, i) => (
            <div key={i} className="py-3.5">
              <BattleBars battle={b} onClick={() => openCompare(b.type, b.aId, b.bId)} scale="sm" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BattleBars({ battle, onClick, scale }: { battle: Battle; onClick: () => void; scale: "lg" | "sm" }) {
  const max = Math.max(battle.aValue, battle.bValue, 1);
  const aPct = Math.max((battle.aValue / max) * 100, 4);
  const bPct = Math.max((battle.bValue / max) * 100, 4);
  const nameClass = scale === "lg" ? "text-base" : "text-sm";
  const valueClass = scale === "lg" ? "text-lg" : "text-sm";
  const barH = scale === "lg" ? "h-2" : "h-1.5";

  return (
    <button onClick={onClick} className="group block w-full text-left">
      <div className="flex items-center justify-between gap-3">
        <span className={`${nameClass} font-medium text-white transition-colors group-hover:text-white`}>{battle.aLabel}</span>
        <span className={`${valueClass} font-mono font-bold tabular-nums text-white`}>{battle.aValue}</span>
      </div>
      <div className={`mt-1.5 ${barH} overflow-hidden rounded-full bg-white/[0.06]`}>
        <div className="h-full rounded-full bg-[var(--f1-red)] transition-all duration-300" style={{ width: `${aPct}%` }} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className={`${nameClass} font-medium text-neutral-300`}>{battle.bLabel}</span>
        <span className={`${valueClass} font-mono tabular-nums text-neutral-300`}>{battle.bValue}</span>
      </div>
      <div className={`mt-1.5 ${barH} overflow-hidden rounded-full bg-white/[0.06]`}>
        <div className="h-full rounded-full bg-white/35 transition-all duration-300" style={{ width: `${bPct}%` }} />
      </div>
      <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--f1-red)]">
        {battle.gap === 0 ? "Tied" : `${battle.gap} point${battle.gap === 1 ? "" : "s"} apart`}
      </p>
    </button>
  );
}

/** A compact editorial leaderboard instead of seven identical icon cards — a two-column grid of
 * quiet label/name/value rows, the number doing the visual work rather than an emoji. */
function RecordsPanel({ records }: { records: SeasonRecord[] }) {
  if (records.length === 0) return <EmptyState>Not enough races yet for season records.</EmptyState>;
  return (
    <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
      {records.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-3 first:pt-0">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{r.label}</p>
            <p className="mt-0.5 truncate text-sm text-neutral-200">{r.name}</p>
          </div>
          <p className="shrink-0 font-mono text-lg font-bold tabular-nums text-white">{r.value}</p>
        </div>
      ))}
    </div>
  );
}
