"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { ArchiveResultEntry } from "@/lib/firestore/archive";

// Ergast's `status` text is the richest per-driver "what happened" signal this data actually
// has (no safety-car/incident data exists at all) — worth a visual split rather than the plain
// neutral text it got before: a clean finish, a finish-but-lapped, a mechanical DNF, and a
// contact/accident DNF each read differently at a glance.
function statusColor(status: string): string {
  if (status === "Finished" || /^\+\d+ Lap/.test(status)) return "text-neutral-400";
  if (/Accident|Collision|Spun off|Disqualified/i.test(status)) return "text-[var(--f1-red)]";
  return "text-amber-400"; // mechanical/other retirement (Engine, Gearbox, Overheating, ...)
}

export function ArchiveResultsTable({ results }: { results: ArchiveResultEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--f1-line)]">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-black/30 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Pos</th>
            <th className="px-4 py-3">Driver</th>
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3 text-right">Grid</th>
            <th className="px-4 py-3 text-right">Laps</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Time</th>
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
              <td className="whitespace-nowrap px-4 py-2.5 text-white">
                {r.driverName}
                {/* Every classified finisher gets their own ranked fastestLap entry (their
                    personal-best lap + where it placed) — only rank 1 is the race's outright
                    fastest lap, which is the only one worth a badge. */}
                {r.fastestLap?.rank === 1 && (
                  <span className="ml-2 rounded-full bg-[var(--f1-red)]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--f1-red)]">
                    Fastest lap
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">{r.constructor}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{r.grid ?? "—"}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{r.laps ?? "—"}</td>
              <td className={`whitespace-nowrap px-4 py-2.5 ${statusColor(r.status)}`}>{r.status}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-neutral-400">{r.time ?? "—"}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-white">{r.points}</td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
