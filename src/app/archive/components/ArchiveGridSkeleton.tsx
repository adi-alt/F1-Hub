"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { Skeleton } from "@/components/ui/Skeleton";

/** Matches ArchiveSeasonGrid's real shape - a small era-name heading (no description line, that's
 * not rendered anymore either) over a dense grid of compact year badges, not tall analytics cards.
 * "By year" is the default landing state for a plain /archive visit, so it's what this loading
 * state should resemble. */
export function ArchiveGridSkeleton({ sections = 2, perSection = 12 }: { sections?: number; perSection?: number }) {
  return (
    <div>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className={s === 0 ? "" : "mt-6"}>
          <Skeleton className="mb-2 h-3 w-28" />
          <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {Array.from({ length: perSection }).map((_, i) => (
              <motion.div key={i} variants={staggerItem}>
                <Skeleton className="h-16 rounded-xl" />
              </motion.div>
            ))}
          </motion.div>
        </div>
      ))}
    </div>
  );
}
