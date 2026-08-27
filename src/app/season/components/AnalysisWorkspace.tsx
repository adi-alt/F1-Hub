"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { tugPct } from "../lib/seasonStats";
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

// A sensible floor, not an arbitrary fixed box — short views (an empty state, the Compare
// picker before two are chosen) get centered inside this instead of collapsing to nothing;
// taller views (Progression's chart, a full battle list) grow past it freely, animated.
const MIN_CONTENT_HEIGHT = 220;

/** Measures a content node's real height and keeps it in state, live, via ResizeObserver — the
 * container that renders it can then animate `height` to real pixel values on every change
 * instead of snapping, and (because it's a real height, not a transform) content that follows
 * on the page reflows in step with the animation rather than jumping once it ends. */
function useMeasuredHeight<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dep]);
  return { ref, height };
}

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
  const { ref: measureRef, height } = useMeasuredHeight<HTMLDivElement>(analysisTab);

  return (
    <div className="glass-surface overflow-hidden rounded-2xl">
      <div className="flex items-baseline gap-1 overflow-x-auto px-5 pt-4 scrollbar-hide">
        <p className="mr-4 shrink-0 text-xs font-semibold uppercase leading-none tracking-[0.16em] text-neutral-500">Analysis</p>
        <nav className="flex shrink-0 items-baseline gap-6">
          {TABS.map((t) => {
            const active = analysisTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setAnalysisTab(t.key)}
                className={`relative shrink-0 pb-3 text-sm font-medium leading-none transition-colors duration-200 ${active ? "text-white" : "text-neutral-500 hover:text-neutral-300"}`}
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

      <motion.div
        animate={{ height: height ?? MIN_CONTENT_HEIGHT }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        style={{ minHeight: MIN_CONTENT_HEIGHT }}
        className="relative overflow-hidden"
      >
        <div ref={measureRef}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={analysisTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="p-5"
            >
              {analysisTab === "battles" && <BattlesPanel battles={battles} />}
              {analysisTab === "compare" && <ComparePanel drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />}
              {analysisTab === "progression" && <ProgressionPanel drivers={drivers} constructors={constructors} progression={progression} />}
              {analysisTab === "records" && <RecordsPanel records={records} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[180px] items-center justify-center text-sm text-neutral-500">{children}</div>;
}

/** One compact row per battle (not a card, not a pair of full-width bars) — a single tug-of-war
 * bar per row, same visual language as Compare's stat rows, so the two tabs read as one system.
 * Battles are pre-sorted tightest-first; the closest gets a thin red accent line instead of extra
 * size, echoing the standings table's own favorite-row treatment. Clicking a row jumps straight
 * into Compare with that pair loaded. */
function BattlesPanel({ battles }: { battles: Battle[] }) {
  const { openCompare } = useSeasonExplorer();
  if (battles.length === 0) return <EmptyState>No close battles yet, check back once more races are in.</EmptyState>;

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Closest battles</p>
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-white/[0.06]">
        {battles.map((b, i) => (
          <motion.div key={i} variants={staggerItem}>
            <BattleRow battle={b} isClosest={i === 0} onClick={() => openCompare(b.type, b.aId, b.bId)} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function BattleRow({ battle, isClosest, onClick }: { battle: Battle; isClosest: boolean; onClick: () => void }) {
  const [aPct, bPct] = tugPct(battle.aValue, battle.bValue);

  return (
    <button
      onClick={onClick}
      className={`group -mx-2 flex w-full items-center gap-3 rounded-md border-l-2 px-2 py-2 text-left transition-colors duration-150 hover:bg-white/[0.03] ${
        isClosest ? "border-l-[var(--f1-red)]" : "border-l-transparent"
      }`}
    >
      <span className="w-24 shrink-0 truncate text-right text-sm font-medium text-white sm:w-32">{battle.aLabel}</span>
      <span className="w-8 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-white">{battle.aValue}</span>
      <span className="flex flex-1 items-center gap-1">
        <span className="flex h-1 flex-1 justify-end overflow-hidden rounded-l-full bg-white/[0.06]">
          <span
            className="h-full rounded-l-full transition-all duration-300 ease-out"
            style={{ width: `${aPct}%`, background: "linear-gradient(90deg, rgba(225,6,0,0.55), var(--f1-red))", boxShadow: aPct > 0 ? "0 0 4px rgba(225,6,0,0.35)" : undefined }}
          />
        </span>
        <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
        <span className="flex h-1 flex-1 overflow-hidden rounded-r-full bg-white/[0.06]">
          <span
            className="h-full rounded-r-full transition-all duration-300 ease-out"
            style={{ width: `${bPct}%`, background: "linear-gradient(90deg, rgba(255,255,255,0.45), rgba(255,255,255,0.15))" }}
          />
        </span>
      </span>
      <span className="w-8 shrink-0 text-left font-mono text-sm tabular-nums text-neutral-300">{battle.bValue}</span>
      <span className="w-24 shrink-0 truncate text-sm text-neutral-300 sm:w-32">{battle.bLabel}</span>
      <span className="w-14 shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-neutral-500 transition-colors group-hover:text-[var(--f1-red)]">
        {battle.gap === 0 ? "Tied" : `+${battle.gap}`}
      </span>
    </button>
  );
}

/** A compact editorial leaderboard instead of seven identical icon cards — a two-column grid of
 * quiet label/name/value rows, the number doing the visual work rather than an emoji. */
function RecordsPanel({ records }: { records: SeasonRecord[] }) {
  if (records.length === 0) return <EmptyState>Not enough races yet for season records.</EmptyState>;
  return (
    // Every row the same height/vertical rhythm regardless of column - `first:pt-0` here would
    // only ever match the very first DOM child (the top-left cell), not its row-mate in the
    // right column, which is exactly what made the two columns drift out of alignment on row 1.
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
      {records.map((r, i) => (
        <motion.div key={i} variants={staggerItem} className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{r.label}</p>
            <p className="mt-0.5 truncate text-sm text-neutral-200">{r.name}</p>
          </div>
          <p className="shrink-0 font-mono text-lg font-bold tabular-nums text-white">{r.value}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
