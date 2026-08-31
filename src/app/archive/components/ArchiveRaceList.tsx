"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { archiveRaceHref } from "@/lib/routes";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";

/** The Archive year page's own races section - restrained rounded rows (not the current bare
 * plain-list treatment), consistent height/hover/directional affordance across every row,
 * regardless of how much of a given race's data has actually been backfilled. */
export function ArchiveRaceList({ year, races }: { year: number; races: ArchiveRaceDoc[] }) {
  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="space-y-2">
      {races.map((race) => {
        const winner = race.results.find((r) => r.position === 1);
        return (
          <motion.div key={race.id} variants={staggerItem}>
            <Link
              href={archiveRaceHref(year, race.round, race.raceName)}
              className="group flex min-h-[76px] items-center justify-between gap-4 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 px-5 py-3.5 transition hover:border-white/20 hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Round {race.round}</p>
                <p className="mt-0.5 truncate font-semibold text-white">{race.raceName}</p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {race.circuitName}
                  {(race.locality || race.country) && ` · ${[race.locality, race.country].filter(Boolean).join(", ")}`}
                </p>
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
  );
}
