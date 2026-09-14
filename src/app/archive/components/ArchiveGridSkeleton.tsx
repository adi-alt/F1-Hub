"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { Skeleton } from "@/components/ui/Skeleton";

/** Matches ArchiveSeasonGrid/EraSection's real shape - an era-name heading, its year-range +
 * one-line description, over a dense grid of compact year badges (h-20, now that a card also
 * carries a third leader-name line) - not tall analytics cards. "By year" is the default landing
 * state for a plain /archive visit, so it's what this loading state should resemble; keeping this
 * in sync with the real height/spacing is what keeps the skeleton-to-real-content swap from
 * visibly jumping the instant data arrives. */
export function ArchiveGridSkeleton({ sections = 2, perSection = 12 }: { sections?: number; perSection?: number }) {
  return (
    <div>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className={s === 0 ? "" : "mt-7"}>
          <Skeleton className="mb-2.5 h-3 w-28" />
          <Skeleton className="mb-3 h-2.5 w-64 max-w-full" />
          <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {Array.from({ length: perSection }).map((_, i) => (
              <motion.div key={i} variants={staggerItem}>
                <Skeleton className="h-20 rounded-xl" />
              </motion.div>
            ))}
          </motion.div>
        </div>
      ))}
    </div>
  );
}
