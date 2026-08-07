"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { formatLapTime } from "@/lib/format";
import type { RaceResultEntry } from "@/lib/types/race";

export function ResultsTable({ results }: { results: RaceResultEntry[] }) {
  const sorted = [...results].sort((a, b) => a.finishPosition - b.finishPosition);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--f1-line)]">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-black/30 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Pos</th>
            <th className="px-4 py-3">Driver</th>
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3">Grid</th>
            <th className="px-4 py-3">Gap</th>
            <th className="px-4 py-3">Fastest lap</th>
            <th className="px-4 py-3 text-right">Pts</th>
          </tr>
        </thead>
        <motion.tbody
          initial="hidden"
          animate="show"
          variants={staggerContainer}
          className="divide-y divide-[var(--f1-line)]"
        >
          {sorted.map((r) => (
            <motion.tr
              key={r.driver}
              variants={staggerItem}
              className={`transition hover:bg-white/[0.05] ${r.finishPosition <= 3 ? "bg-white/[0.03]" : ""}`}
            >
              <td className="px-4 py-2.5 font-semibold text-white">
                {r.status === "dnf" ? "DNF" : r.finishPosition}
              </td>
              <td className="px-4 py-2.5 text-white">
                {r.driverName} <span className="text-neutral-500">{r.driver}</span>
              </td>
              <td className="px-4 py-2.5 text-neutral-400">{r.team}</td>
              <td className="px-4 py-2.5 text-neutral-400">{r.grid}</td>
              <td className="px-4 py-2.5 text-neutral-400">
                {r.status === "finished" && r.finishGapSec !== null
                  ? r.finishGapSec === 0
                    ? "Leader"
                    : `+${r.finishGapSec.toFixed(3)}s`
                  : r.status === "lapped"
                    ? "Lapped"
                    : "—"}
              </td>
              <td className="px-4 py-2.5 text-neutral-400">
                {r.fastestLapSec !== null ? formatLapTime(r.fastestLapSec) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-white">{r.points}</td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
