"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { Skeleton } from "@/components/ui/Skeleton";

/** Matches ArchiveCircuitGrid's real card shape - an image band the same h-32 height, then two
 * text lines - instead of a generic rectangle, so the "By track" facet doesn't visibly reflow once
 * real cards paint in over it. */
export function ArchiveCircuitGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div key={i} variants={staggerItem} className="overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]">
          <Skeleton className="h-32 w-full rounded-none" />
          <div className="px-3.5 py-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-3/4" />
            <Skeleton className="mt-1.5 h-3 w-1/3" />
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
