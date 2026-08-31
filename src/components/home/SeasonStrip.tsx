"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { raceStatusLabel } from "@/lib/format";
import { circuitHref, raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

export function SeasonStrip({ races }: { races: RaceDoc[] }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
    >
      {races.map((race) => {
        const statusLabel = raceStatusLabel(race);
        const card = (
          <div className="flex min-w-[168px] flex-col gap-1 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-4 py-3">
            <span className="text-xs text-neutral-500">Round {race.round}</span>
            <span
              className={
                race.status === "scheduled"
                  ? "text-sm font-semibold text-neutral-400"
                  : "text-sm font-semibold text-white"
              }
            >
              {race.name.replace(" Grand Prix", "")}
            </span>
            <span className="text-xs text-neutral-400">{statusLabel}</span>
          </div>
        );

        // "scheduled" has no race doc to view yet, but the track has history — link there
        // instead of a dead end.
        const href = race.status === "scheduled" ? circuitHref(race.circuit) : raceHref(race.year, race.round, race.name);
        return (
          <motion.div key={race.id} variants={staggerItem} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}>
            <Link
              href={href}
              className="block rounded-xl transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
            >
              {card}
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
