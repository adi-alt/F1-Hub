"use client";

import { motion } from "framer-motion";
import { staggerContainer } from "@/components/motion/variants";
import { groupYearsByEra } from "@/lib/eras";
import { SeasonCard } from "./SeasonCard";
import { EraSection } from "./EraSection";

/** Years grouped by era (see src/lib/eras.ts - nothing here compares a year against a literal
 * number, groupYearsByEra already resolved the grouping). The live/current season - not part of
 * `years` at all, the archive only covers seasons through last year - folds into whichever era it
 * actually belongs to (eraForYear resolves it the same as any other year) rather than getting a
 * separate hero treatment; SeasonCard's `isLive` just swaps its link to /season and adds a small
 * dot, same size as every other card. */
export function ArchiveSeasonGrid({
  years,
  currentYear,
  showLiveSeason,
}: {
  years: number[];
  currentYear: number;
  showLiveSeason: boolean;
}) {
  const allYears = showLiveSeason && !years.includes(currentYear) ? [currentYear, ...years] : years;
  const groups = groupYearsByEra(allYears);

  // Single era, single group - the common case when a filter's active - doesn't need its own
  // heading repeating what the filter trigger already says.
  if (groups.length === 1) {
    return (
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {groups[0].years.map((year) => (
          <SeasonCard key={year} year={year} isLive={showLiveSeason && year === currentYear} />
        ))}
      </motion.div>
    );
  }

  return (
    <div className="pb-2">
      {groups.map(({ era, years: eraYears }) => (
        <EraSection key={era.id} era={era} years={eraYears} liveYear={showLiveSeason ? currentYear : undefined} />
      ))}
    </div>
  );
}
