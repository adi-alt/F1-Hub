"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { formatLapTime } from "@/lib/format";
import type { RaceHighlights } from "@/lib/highlights";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -3 }}
      className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4 transition hover:border-white/20 hover:shadow-lg hover:shadow-black/30"
    >
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-neutral-500">{sub}</p>}
    </motion.div>
  );
}

export function HighlightsPanel({ highlights }: { highlights: RaceHighlights }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard label="Pole position" value={highlights.poleSitter} />
      <StatCard
        label="Fastest lap"
        value={highlights.fastestLap?.driver ?? "—"}
        sub={highlights.fastestLap ? formatLapTime(highlights.fastestLap.timeSec) : undefined}
      />
      <StatCard
        label="Biggest mover"
        value={highlights.biggestGainer ? `${highlights.biggestGainer.driver} +${highlights.biggestGainer.positionsGained}` : "—"}
      />
      <StatCard
        label="Biggest drop"
        value={highlights.biggestLoser ? `${highlights.biggestLoser.driver} -${highlights.biggestLoser.positionsLost}` : "—"}
      />
    </motion.div>
  );
}
