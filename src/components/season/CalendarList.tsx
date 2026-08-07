"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { raceStatusLabel } from "@/lib/format";
import { raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

export function CalendarList({ races }: { races: RaceDoc[] }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="divide-y divide-[var(--f1-line)] overflow-hidden rounded-xl border border-[var(--f1-line)]"
    >
      {races.map((race) => (
        <motion.div key={race.id} variants={staggerItem}>
          <Link
            href={raceHref(race.year, race.slug)}
            className="flex items-center justify-between gap-4 bg-[var(--f1-carbon)] px-5 py-3 transition hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-4">
              <span className="w-8 shrink-0 text-xs text-neutral-500">R{race.round}</span>
              <span className="font-medium text-white">{race.name}</span>
            </div>
            <span className="text-sm text-neutral-400">{raceStatusLabel(race)}</span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
