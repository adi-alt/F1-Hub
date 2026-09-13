"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

export function PastWinnersList({ races }: { races: RaceDoc[] }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="divide-y divide-[var(--f1-line)] overflow-hidden rounded-xl border border-[var(--f1-line)]"
    >
      {[...races]
        .sort((a, b) => b.year - a.year)
        .map((race) => {
          const winner = race.results?.find((r) => r.finishPosition === 1);
          return (
            <motion.div key={race.id} variants={staggerItem}>
              <Link
                href={raceHref(race.year, race.round, race.name)}
                className="flex items-center justify-between bg-[var(--f1-carbon)] px-5 py-3 transition hover:bg-white/[0.05]"
              >
                <span className="font-medium text-white">{race.year}</span>
                <span className="text-sm text-neutral-400">
                  {winner ? `${winner.driverName} (${winner.team})` : "No result recorded"}
                </span>
              </Link>
            </motion.div>
          );
        })}
    </motion.div>
  );
}
