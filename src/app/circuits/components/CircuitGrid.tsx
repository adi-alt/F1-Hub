"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { circuitHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

export function CircuitGrid({ races }: { races: RaceDoc[] }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {races.map((race) => (
        <motion.div key={race.circuit} variants={staggerItem} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
          <Link
            href={circuitHref(race.circuit)}
            className="block rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
          >
            <p className="text-xs text-neutral-500">Round {race.round}</p>
            <p className="font-semibold text-white">{race.name}</p>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
