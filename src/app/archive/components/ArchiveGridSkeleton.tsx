"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { Skeleton } from "@/components/ui/Skeleton";

/** Matches ArchiveSeasonGrid's real shape exactly (same grid columns, same badge size) — the
 * "By year" facet is the default landing state for a plain /archive visit, so it's what this
 * loading state should resemble. Badges fade/slide in with the same stagger the real ones use. */
export function ArchiveGridSkeleton({ count = 24 }: { count?: number }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6"
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div key={i} variants={staggerItem}>
          <Skeleton className="h-11 rounded-xl" />
        </motion.div>
      ))}
    </motion.div>
  );
}
