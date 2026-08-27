"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { Skeleton } from "@/components/ui/Skeleton";

/** Matches ArchiveSeasonGrid's real shape - two era-section blocks (a heading line + a grid of
 * season-card-sized skeletons, not the old flat single-height badge grid) - the "By year" facet is
 * the default landing state for a plain /archive visit, so it's what this loading state should
 * resemble. */
export function ArchiveGridSkeleton({ sections = 2, perSection = 10 }: { sections?: number; perSection?: number }) {
  return (
    <div>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className={s === 0 ? "" : "mt-8"}>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-3 w-64" />
          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            {Array.from({ length: perSection }).map((_, i) => (
              <motion.div key={i} variants={staggerItem}>
                <Skeleton className="h-[70px] rounded-xl" />
              </motion.div>
            ))}
          </motion.div>
        </div>
      ))}
    </div>
  );
}
