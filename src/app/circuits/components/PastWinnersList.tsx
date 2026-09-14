"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";

/**
 * The circuit's full winner history, not just whatever the live `races` table happens to cover
 * (2018+) - fed from buildCircuitTimeline's own merge of archive_races and `races`, the same real
 * multi-decade record circuitIntelligence.ts already assembles for the Track Records section
 * beside this one, so the two can never disagree about who actually won which year.
 */
export function PastWinnersList({ timeline }: { timeline: CircuitYearRecord[] }) {
  const withWinners = timeline.filter((r) => r.winnerDriver);
  if (withWinners.length === 0) return null;

  return (
    <motion.ol initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-white/[0.055]">
      {withWinners.map((r) => (
        <motion.li key={r.year} variants={staggerItem} className="flex items-center justify-between gap-3 py-2.5">
          <span className="w-14 shrink-0 font-mono text-sm font-semibold tabular-nums text-white">{r.year}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">{r.winnerDriver}</span>
          {r.winnerTeam && <span className="shrink-0 truncate text-xs text-neutral-500">{r.winnerTeam}</span>}
        </motion.li>
      ))}
    </motion.ol>
  );
}
