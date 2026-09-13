"use client";

import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { AnalysisEmptyState } from "./AnalysisEmptyState";
import { SeasonInsight, SeasonInsightSkeleton } from "./ai/SeasonInsight";
import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";
import type { SeasonRecord } from "../_service/season.pure";

/**
 * Curated, not a wall of statistics: every record answers "why does this matter" on its own line,
 * deterministically (see buildRecords). A record Apex singles out gets a thin red rule rather than
 * extra size — emphasis without another card.
 */
export function RecordsPanel({ records }: { records: SeasonRecord[] }) {
  const { intelligence, loading } = useSeasonIntelligence();
  const reduceMotion = useReducedMotion();

  if (records.length === 0) return <AnalysisEmptyState>Not enough rounds have run for season records to mean much yet.</AnalysisEmptyState>;

  const insight = intelligence?.recordInsight;
  const highlighted = new Set(insight?.highlightedRecordIds ?? []);

  return (
    <div>
      {loading ? <SeasonInsightSkeleton label="Loading records insight" /> : insight && <SeasonInsight eyebrow="Apex on the records" headline={insight.headline} summary={insight.summary} />}

      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {records.map((r) => (
          <motion.div
            key={r.id}
            variants={reduceMotion ? undefined : staggerItem}
            className={`flex items-start gap-4 border-b border-white/[0.055] py-3 pl-2.5 ${highlighted.has(r.id) ? "border-l-2 border-l-[var(--f1-red)]" : "border-l-2 border-l-transparent"}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{r.label}</p>
              <p className="mt-0.5 truncate text-sm text-neutral-200">{r.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-neutral-600">{r.why}</p>
            </div>
            <p className="min-w-[3.5ch] shrink-0 text-right font-mono text-lg font-bold tabular-nums text-white">{r.value}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
