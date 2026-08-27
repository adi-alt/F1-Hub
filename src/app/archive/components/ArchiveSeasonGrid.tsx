"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/motion/variants";
import { groupYearsByEra } from "@/lib/eras";
import type { ArchiveYearStats } from "@/lib/supabase/archive";
import { EraSection } from "./EraSection";

/** Years grouped by era (see src/lib/eras.ts - nothing here compares a year against a literal
 * number, groupYearsByEra already resolved the grouping) instead of one flat grid. The live/
 * current season - not part of `years` at all, the archive only covers seasons through last year -
 * gets its own card up top when nothing's filtering it out, pointing at /season (the archive has
 * no data for a season still in progress) rather than /archive?year=. */
export function ArchiveSeasonGrid({
  years,
  yearStats,
  currentYear,
  showLiveSeason,
}: {
  years: number[];
  yearStats: Record<number, ArchiveYearStats>;
  currentYear: number;
  showLiveSeason: boolean;
}) {
  const groups = groupYearsByEra(years);

  return (
    <div className="pb-2">
      {showLiveSeason && (
        <motion.div variants={staggerItem} initial="hidden" animate="show" className="mb-6">
          <Link
            href="/season"
            className="glass-surface flex items-center justify-between gap-4 rounded-xl px-5 py-4 transition hover:border-white/20"
          >
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold text-white">
                {currentYear}
                <span className="pulse-ring inline-flex items-center gap-1.5 rounded-full bg-[var(--f1-red)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--f1-red)]">
                  Live
                </span>
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">This season is still underway</p>
            </div>
            <span className="shrink-0 text-sm text-neutral-400">View live standings →</span>
          </Link>
        </motion.div>
      )}

      {groups.map(({ era, years: eraYears }) => (
        <EraSection key={era.id} era={era} years={eraYears} yearStats={yearStats} />
      ))}
    </div>
  );
}
