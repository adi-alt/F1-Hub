"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { raceHref } from "@/lib/routes";
import type { RaceSummary } from "@/app/season/_service/season.service";

/** A compact race timeline below the calendar - restrained rounded rows, not giant per-race cards
 * - the one genuinely new Season-page section (nothing like it existed before). Same row shape
 * ArchiveHistoryRaceList.tsx already established, fed by raceSummaries SeasonDetail already has -
 * no new data, no new fetch. */
export function RaceList({ year, raceSummaries }: { year: number; raceSummaries: RaceSummary[] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Races</p>
      <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} variants={staggerContainer} className="space-y-2">
        {raceSummaries.map((r) => {
          const winner = r.results.find((res) => res.finishPosition === 1);
          const dateLabel = r.raceDate ? new Date(r.raceDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
          return (
            <motion.div key={r.round} variants={staggerItem}>
              <Link
                href={raceHref(year, r.round, r.name)}
                className="group flex min-h-[64px] items-center justify-between gap-4 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 px-5 py-3 transition hover:border-white/20 hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
              >
                <div className="flex min-w-0 items-baseline gap-4">
                  <span className="w-6 shrink-0 font-mono text-sm text-neutral-500">{String(r.round).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{r.name}</p>
                    {dateLabel && <p className="text-xs text-neutral-500">{dateLabel}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {winner && (
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Winner</p>
                      <p className="text-sm font-medium text-white">{winner.driverName}</p>
                    </div>
                  )}
                  <span className="text-neutral-600 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-neutral-400">→</span>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
