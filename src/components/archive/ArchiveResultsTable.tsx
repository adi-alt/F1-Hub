"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { ArchiveResultEntry } from "@/lib/firestore/archive";

export function ArchiveResultsTable({ results }: { results: ArchiveResultEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--f1-line)]">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-black/30 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Pos</th>
            <th className="px-4 py-3">Driver</th>
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3 text-right">Grid</th>
            <th className="px-4 py-3 text-right">Laps</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <motion.tbody initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
          {results.map((r) => (
            <motion.tr
              key={r.driverId}
              variants={staggerItem}
              className={`transition hover:bg-white/[0.05] ${r.position <= 3 ? "bg-white/[0.03]" : ""}`}
            >
              <td className="px-4 py-2.5 font-semibold text-white">{r.positionText}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-white">{r.driverName}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">{r.constructor}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{r.grid ?? "—"}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{r.laps ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">{r.status}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-white">{r.points}</td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
