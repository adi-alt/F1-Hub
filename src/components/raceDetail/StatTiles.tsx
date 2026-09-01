"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";

export type StatTile = { label: string; value: string; sub?: string };

/** Generalized from the old HighlightsPanel.tsx (Season-only) into a plain tile-list component
 * both Season and Archive's Overview tabs call, each building their own tiles from their own real
 * data at the call site - same "shared presentation, adapt at the call site" shape as
 * RaceHeader/RacePodium/RaceResultsTable. A fixed 2x2 grid, not a row that grows with the
 * viewport - this now sits beside Race Story in a narrower column, not spanning full width.
 * Deliberately tight padding (px-3 py-2, not the old p-4) - these four tiles being taller than
 * they needed to be was what made the whole Race Overview read as taller than its own content,
 * and what made the shorter Circuit column beside it feel disconnected. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <motion.div
          key={t.label}
          variants={staggerItem}
          whileHover={{ y: -2 }}
          className="surface-inset rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 px-3 py-2 transition hover:border-white/20"
        >
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">{t.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-white">{t.value}</p>
          {t.sub && <p className="text-[11px] text-neutral-500">{t.sub}</p>}
        </motion.div>
      ))}
    </motion.div>
  );
}
