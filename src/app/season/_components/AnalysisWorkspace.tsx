"use client";

import { useCallback, useId, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { useSeasonExplorer, type AnalysisTab } from "../_context/SeasonExplorerContext";
import { BattlesPanel } from "./BattlesPanel";
import { ComparePanel } from "./ComparePanel";
import { ProgressionPanel } from "./ProgressionPanel";
import { RecordsPanel } from "./RecordsPanel";
import type { Battle, ConstructorStandingRow, DriverStandingRow, PersonalSeasonContext, RaceSummary, SeasonRecord } from "../_service/season.pure";

const TABS: { key: AnalysisTab; label: string }[] = [
  { key: "battles", label: "Battles" },
  { key: "compare", label: "Compare" },
  { key: "progression", label: "Progression" },
  { key: "records", label: "Records" },
];

// A floor, not a fixed box — short views get centred inside it instead of collapsing; taller ones
// grow past it freely.
const MIN_CONTENT_HEIGHT = 240;

/**
 * The single workspace below the standings. One of four analyses at a time.
 *
 * Surface: this used to sit on `.glass-surface`, which is a heavy, near-opaque panel meant for
 * floating dropdowns and tooltips. At section scale it read as a separate application embedded in
 * the page — a grey slab with its own edges. It now uses a low-opacity tint and a hairline border
 * with a light blur, so the page background reads continuously through it and the tab strip looks
 * part of the page rather than a second navigation bar.
 *
 * Tabs are a real ARIA tablist: arrow keys move between them, Home/End jump to the ends, and only
 * the active tab is in the tab order (roving tabindex), which is how a tablist is supposed to
 * behave and what the previous plain-buttons version didn't do.
 */
export function AnalysisWorkspace({
  battles,
  records,
  drivers,
  constructors,
  progression,
  raceSummaries,
  season,
  personal,
}: {
  battles: Battle[];
  records: SeasonRecord[];
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string | null>[];
  raceSummaries: RaceSummary[];
  season: number;
  personal: PersonalSeasonContext;
}) {
  const { analysisTab, setAnalysisTab } = useSeasonExplorer();
  const { ref: measureRef, height } = useMeasuredHeight<HTMLDivElement>(analysisTab);
  const reduceMotion = useReducedMotion();
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const index = TABS.findIndex((t) => t.key === analysisTab);
      let next = index;
      if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
      else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = TABS.length - 1;
      else return;
      e.preventDefault();
      setAnalysisTab(TABS[next].key);
      tabRefs.current[TABS[next].key]?.focus();
    },
    [analysisTab, setAnalysisTab],
  );

  return (
    <section
      aria-label="Season analysis"
      className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.012] backdrop-blur-[2px]"
    >
      <div className="flex items-baseline gap-4 overflow-x-auto px-4 pt-3.5 sm:px-5 scrollbar-hide">
        <p className="shrink-0 text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-neutral-500">Analysis</p>
        <div role="tablist" aria-label="Season analysis views" onKeyDown={onKeyDown} className="flex shrink-0 items-baseline gap-5 sm:gap-6">
          {TABS.map((t) => {
            const active = analysisTab === t.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                role="tab"
                id={`${baseId}-tab-${t.key}`}
                aria-selected={active}
                aria-controls={`${baseId}-panel-${t.key}`}
                // Roving tabindex: Tab reaches the strip once, then arrow keys move within it.
                tabIndex={active ? 0 : -1}
                onClick={() => setAnalysisTab(t.key)}
                className={`relative shrink-0 rounded-[2px] pb-3 text-sm font-medium leading-none transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--f1-red)] ${
                  active ? "text-white" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {t.label}
                {active && (
                  <motion.span
                    layoutId="analysis-tab-underline"
                    className="absolute inset-x-0 -bottom-px h-[2px] bg-[var(--f1-red)]"
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div aria-hidden className="border-b border-white/[0.06]" />

      <motion.div
        animate={{ height: height ?? MIN_CONTENT_HEIGHT }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: "easeInOut" }}
        style={{ minHeight: MIN_CONTENT_HEIGHT }}
        className="relative overflow-hidden"
      >
        <div ref={measureRef}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={analysisTab}
              role="tabpanel"
              id={`${baseId}-panel-${analysisTab}`}
              aria-labelledby={`${baseId}-tab-${analysisTab}`}
              tabIndex={0}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="p-4 focus-visible:outline-none sm:p-5"
            >
              {analysisTab === "battles" && <BattlesPanel battles={battles} personal={personal} />}
              {analysisTab === "compare" && <ComparePanel season={season} drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />}
              {analysisTab === "progression" && <ProgressionPanel drivers={drivers} constructors={constructors} progression={progression} />}
              {analysisTab === "records" && <RecordsPanel records={records} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}
