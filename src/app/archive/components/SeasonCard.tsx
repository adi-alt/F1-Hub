"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/motion/variants";
import { archiveSeasonHref } from "@/lib/routes";

/** One season, as a compact selectable badge - the grid's job is scanning decades quickly, not
 * carrying per-card analytics (race count/most-wins already live on the season detail page this
 * links to). `isLive` is the one exception: the in-progress season gets a small pulsing dot and
 * links to /season instead of /archive?year=, since the archive has no data for it yet - same
 * size and treatment as every other card, not a separate hero. */
export function SeasonCard({ year, isLive = false }: { year: number; isLive?: boolean }) {
  return (
    <motion.div variants={staggerItem} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
      <Link
        href={isLive ? "/season" : archiveSeasonHref(year)}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-4 py-3 text-center font-semibold text-white transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
      >
        {year}
        {isLive && <span className="pulse-ring h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" aria-label="Live" />}
      </Link>
    </motion.div>
  );
}
