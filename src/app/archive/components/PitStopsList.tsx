"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { ArchivePitStopEntry, ArchiveResultEntry } from "@/lib/firestore/archive";

// Pit stops are keyed by driverId only (see archive.ts's comment on why they're not merged into
// results) — driver names come from the race's own results array instead of being duplicated
// onto every stop.
export function PitStopsList({ pitStops, results }: { pitStops: ArchivePitStopEntry[]; results: ArchiveResultEntry[] }) {
  const nameFor = (driverId: string) => results.find((r) => r.driverId === driverId)?.driverName ?? driverId;
  const sorted = [...pitStops].sort((a, b) => a.lap - b.lap || a.stop - b.stop);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--f1-line)]">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-black/30 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Driver</th>
            <th className="px-4 py-3 text-right">Lap</th>
            <th className="px-4 py-3 text-right">Stop #</th>
            <th className="px-4 py-3 text-right">Duration</th>
          </tr>
        </thead>
        <motion.tbody initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
          {sorted.map((p, i) => (
            <motion.tr key={`${p.driverId}-${p.stop}-${i}`} variants={staggerItem} className="transition hover:bg-white/[0.05]">
              <td className="whitespace-nowrap px-4 py-2.5 text-white">{nameFor(p.driverId)}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{p.lap}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{p.stop}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">
                {p.durationSec !== null ? `${p.durationSec.toFixed(3)}s` : "—"}
              </td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
