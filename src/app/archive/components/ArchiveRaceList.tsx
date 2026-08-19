"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { archiveRaceHref } from "@/lib/routes";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";

export function ArchiveRaceList({ year, races }: { year: number; races: ArchiveRaceDoc[] }) {
  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="mt-8 space-y-2">
      {races.map((race) => {
        const winner = race.results.find((r) => r.position === 1);
        return (
          <motion.div key={race.id} variants={staggerItem}>
            <Link
              href={archiveRaceHref(year, race.round)}
              className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
            >
              <div>
                <p className="text-xs text-neutral-500">Round {race.round}</p>
                <p className="font-semibold text-white">{race.raceName}</p>
                <p className="text-xs text-neutral-500">{race.circuitName}</p>
              </div>
              {winner && (
                <div className="text-right">
                  <p className="text-xs text-neutral-500">Winner</p>
                  <p className="text-sm font-medium text-white">{winner.driverName}</p>
                </div>
              )}
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
