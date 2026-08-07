"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { ConstructorStanding, DriverStanding } from "@/lib/standings";

export function DriverStandingsTable({ standings }: { standings: DriverStanding[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--f1-line)]">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-black/30 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Pos</th>
            <th className="px-4 py-3">Driver</th>
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3 text-right">Wins</th>
            <th className="px-4 py-3 text-right">Podiums</th>
            <th className="px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <motion.tbody initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
          {standings.map((s, i) => (
            <motion.tr
              key={s.driver}
              variants={staggerItem}
              className={`transition hover:bg-white/[0.05] ${i < 3 ? "bg-white/[0.03]" : ""}`}
            >
              <td className="px-4 py-2.5 font-semibold text-white">{i + 1}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-white">
                {s.driverName} <span className="text-neutral-500">{s.driver}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">{s.team}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{s.wins}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{s.podiums}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-white">{s.points}</td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}

export function ConstructorStandingsTable({ standings }: { standings: ConstructorStanding[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--f1-line)]">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-black/30 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Pos</th>
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3 text-right">Wins</th>
            <th className="px-4 py-3 text-right">Podiums</th>
            <th className="px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <motion.tbody initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
          {standings.map((s, i) => (
            <motion.tr
              key={s.team}
              variants={staggerItem}
              className={`transition hover:bg-white/[0.05] ${i < 3 ? "bg-white/[0.03]" : ""}`}
            >
              <td className="px-4 py-2.5 font-semibold text-white">{i + 1}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-white">{s.team}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{s.wins}</td>
              <td className="px-4 py-2.5 text-right text-neutral-400">{s.podiums}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-white">{s.points}</td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
