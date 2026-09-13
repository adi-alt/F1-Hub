"use client";

import type { FocusEvent, MouseEvent } from "react";
import { motion } from "framer-motion";
import { staggerContainer } from "@/components/motion/variants";
import { SeasonCard } from "./SeasonCard";
import type { Era } from "@/lib/eras";
import type { ArchiveYearStats } from "@/lib/supabase/archive";

/** One era's heading over a grid of its seasons - the "years grouped by era" structure the era
 * system exists for, see src/lib/eras.ts. Which years belong to which era is never decided here -
 * groupYearsByEra already resolved that before this ever renders. Just the era name as a small
 * heading, not a paragraph of editorial description - `era.description` still exists in the
 * config (useful as a tooltip, costs no visible space) but isn't rendered as body copy; era
 * context matters less than being able to scan the years themselves quickly. onHoverStart/
 * onHoverEnd just pass straight through to each SeasonCard - the hover state and tooltip panel
 * itself live one level up, in ArchiveSeasonGrid, which is the level with a single anchor
 * spanning every era section. */
export function EraSection({
  era,
  years,
  liveYear,
  yearStats,
  onCardHoverStart,
  onCardHoverEnd,
}: {
  era: Era;
  years: number[];
  liveYear?: number;
  yearStats: Record<number, ArchiveYearStats>;
  onCardHoverStart: (e: MouseEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>, year: number) => void;
  onCardHoverEnd: (year: number) => void;
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500" title={era.description}>
        {era.name}
      </h2>
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {years.map((year) => (
          <SeasonCard
            key={year}
            year={year}
            isLive={year === liveYear}
            raceCount={yearStats[year]?.raceCount}
            onHoverStart={onCardHoverStart}
            onHoverEnd={onCardHoverEnd}
          />
        ))}
      </motion.div>
    </section>
  );
}
