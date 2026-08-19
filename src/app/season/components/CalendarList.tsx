"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { raceStatusLabel } from "@/lib/format";
import { circuitHref, raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

export function CalendarList({ races }: { races: RaceDoc[] }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="divide-y divide-[var(--f1-line)] overflow-hidden rounded-xl border border-[var(--f1-line)]"
    >
      {races.map((race) => {
        const row = (
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="flex items-center gap-4">
              <span className="w-8 shrink-0 text-xs text-neutral-500">R{race.round}</span>
              <span className={race.status === "scheduled" ? "font-medium text-neutral-400" : "font-medium text-white"}>
                {race.name}
              </span>
            </div>
            <span className="text-sm text-neutral-400">{raceStatusLabel(race)}</span>
          </div>
        );
        // "scheduled" (see toCalendarPlaceholder in lib/supabase/races.ts) has no race doc to
        // view yet, but the track itself has history — link there instead of a dead end.
        const href = race.status === "scheduled" ? circuitHref(race.circuit) : raceHref(race.year, race.round);
        return (
          <motion.div key={race.id} variants={staggerItem} className="bg-[var(--f1-carbon)]">
            <Link href={href} className="block transition hover:bg-white/[0.04]">
              {row}
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
