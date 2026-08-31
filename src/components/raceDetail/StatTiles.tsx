"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";

export type StatTile = { label: string; value: string; sub?: string };

/** Generalized from the old HighlightsPanel.tsx (Season-only) into a plain tile-list component
 * both Season and Archive's Overview tabs call, each building their own tiles from their own real
 * data at the call site - same "shared presentation, adapt at the call site" shape as
 * RaceHeader/RacePodium/RaceResultsTable. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <motion.div
          key={t.label}
          variants={staggerItem}
          whileHover={{ y: -3 }}
          className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4 transition hover:border-white/20 hover:shadow-lg hover:shadow-black/30"
        >
          <p className="text-xs uppercase tracking-wide text-neutral-500">{t.label}</p>
          <p className="mt-1 text-lg font-semibold text-white">{t.value}</p>
          {t.sub && <p className="text-xs text-neutral-500">{t.sub}</p>}
        </motion.div>
      ))}
    </motion.div>
  );
}
