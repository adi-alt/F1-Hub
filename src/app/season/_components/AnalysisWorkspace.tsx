"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TabList, TabPanels, Tabs, type TabItem } from "@/components/ui/Tabs";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { useSeasonExplorer, type AnalysisTab } from "../_context/SeasonExplorerContext";
import { BattlesPanel } from "./BattlesPanel";
import { ComparePanel } from "./ComparePanel";
import { ProgressionPanel } from "./ProgressionPanel";
import { RecordsPanel } from "./RecordsPanel";
import type { Battle, ConstructorStandingRow, DriverStandingRow, PersonalSeasonContext, RaceSummary, SeasonRecord } from "../_service/season.pure";

const TABS: TabItem<AnalysisTab>[] = [
  { value: "battles", label: "Battles" },
  { value: "compare", label: "Compare" },
  { value: "progression", label: "Progression" },
  { value: "records", label: "Records" },
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
 * The views are underline Tabs, the section's own navigation; the primitive brings the keyboard
 * behaviour and gives every tab a real panel.
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
  // The view on screen at load appears as it is; only a view switched to afterwards fades in.
  const [shownTab, setShownTab] = useState(analysisTab);
  const [switched, setSwitched] = useState(false);
  if (shownTab !== analysisTab) {
    setShownTab(analysisTab);
    setSwitched(true);
  }

  return (
    <section
      aria-label="Season analysis"
      className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.012] backdrop-blur-[2px]"
    >
      <Tabs value={analysisTab} onValueChange={setAnalysisTab} items={TABS}>
        <div className="flex items-center gap-4 px-4 pt-2.5 sm:px-5">
          <p className="shrink-0 text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-tertiary">Analysis</p>
          <TabList aria-label="Season analysis views" className="min-w-0" />
        </div>
        <div aria-hidden className="border-b border-white/[0.06]" />

        <motion.div
          animate={{ height: height ?? MIN_CONTENT_HEIGHT }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: "easeInOut" }}
          style={{ minHeight: MIN_CONTENT_HEIGHT }}
          className="relative overflow-hidden"
        >
          {/* The padding is on the measured box rather than the panel, so the panel's focus ring
              has room inside this clipping container. */}
          <div ref={measureRef} className="p-4 sm:p-5">
            <TabPanels>
              <motion.div initial={reduceMotion || !switched ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                {analysisTab === "battles" && <BattlesPanel battles={battles} personal={personal} />}
                {analysisTab === "compare" && <ComparePanel season={season} drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />}
                {analysisTab === "progression" && <ProgressionPanel drivers={drivers} constructors={constructors} progression={progression} />}
                {analysisTab === "records" && <RecordsPanel records={records} />}
              </motion.div>
            </TabPanels>
          </div>
        </motion.div>
      </Tabs>
    </section>
  );
}
