"use client";

import { motion } from "framer-motion";
import { staggerContainer } from "@/components/motion/variants";
import { SeasonCard } from "./SeasonCard";
import type { Era } from "@/lib/eras";
import type { ArchiveYearStats } from "@/lib/supabase/archive";

/** One era's heading (name + its own honest, editorial description) over a grid of its seasons -
 * the "years grouped by era" structure the era system exists for, see src/lib/eras.ts. Which years
 * belong to which era is never decided here - groupYearsByEra already resolved that before this
 * ever renders. */
export function EraSection({
  era,
  years,
  yearStats,
}: {
  era: Era;
  years: number[];
  yearStats: Record<number, ArchiveYearStats>;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-400">{era.name}</h2>
        <p className="mt-0.5 max-w-2xl text-xs text-neutral-600">{era.description}</p>
      </div>
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {years.map((year) => (
          <SeasonCard key={year} year={year} stats={yearStats[year]} />
        ))}
      </motion.div>
    </section>
  );
}
