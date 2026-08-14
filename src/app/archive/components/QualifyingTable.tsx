"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { ArchiveQualifyingEntry } from "@/lib/firestore/archive";

export function QualifyingTable({ qualifying }: { qualifying: ArchiveQualifyingEntry[] }) {
  // Eras before the Q1/Q2/Q3 split only ever populate q1 — showing all three columns regardless
  // keeps the table shape stable and just reads as "—" for the sessions that didn't exist yet.
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--f1-line)]">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-black/30 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Pos</th>
            <th className="px-4 py-3">Driver</th>
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3 text-right">Q1</th>
            <th className="px-4 py-3 text-right">Q2</th>
            <th className="px-4 py-3 text-right">Q3</th>
          </tr>
        </thead>
        <motion.tbody initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
          {qualifying.map((q) => (
            <motion.tr key={q.driverId} variants={staggerItem} className="transition hover:bg-white/[0.05]">
              <td className="px-4 py-2.5 font-semibold text-white">{q.position}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-white">{q.driverName}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">{q.constructor}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{q.q1 ?? "—"}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{q.q2 ?? "—"}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{q.q3 ?? "—"}</td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
