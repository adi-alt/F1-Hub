"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

export function NextRaceCard({ race }: { race: RaceDoc | null }) {
  if (!race) {
    return (
      <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6 text-neutral-400">
        No upcoming race scheduled — the season is complete.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">
            Next race · Round {race.round}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">{race.name}</h2>
        </div>
        <Link href={raceHref(race.year, race.slug)} className="group inline-block">
          <motion.span
            whileHover={{ x: 3 }}
            whileTap={{ scale: 0.96 }}
            className="block rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm text-neutral-200 transition group-hover:border-white/30 group-hover:text-white"
          >
            View race →
          </motion.span>
        </Link>
      </div>

      {race.prediction ? (
        <div className="mt-6">
          <p className="mb-3 text-sm text-neutral-400">Predicted top 3</p>
          <motion.ol
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="grid gap-2 sm:grid-cols-3"
          >
            {race.prediction.finishOrder.slice(0, 3).map((entry) => (
              <motion.li
                key={entry.driver}
                variants={staggerItem}
                whileHover={{ y: -2 }}
                className="flex items-center justify-between rounded-lg bg-black/30 px-4 py-3"
              >
                <span className="font-semibold text-white">
                  {entry.predictedPosition}. {entry.driver}
                </span>
                <span className="text-xs text-neutral-400">{entry.team}</span>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      ) : race.polePrediction ? (
        <div className="mt-6">
          <p className="mb-3 text-sm text-neutral-400">
            Predicted pole (prior form — full order unlocks after qualifying)
          </p>
          <motion.ol
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="grid gap-2 sm:grid-cols-3"
          >
            {race.polePrediction.order.slice(0, 3).map((entry) => (
              <motion.li
                key={entry.driver}
                variants={staggerItem}
                whileHover={{ y: -2 }}
                className="flex items-center justify-between rounded-lg bg-black/30 px-4 py-3"
              >
                <span className="font-semibold text-white">
                  {entry.predictedQualiPosition}. {entry.driver}
                </span>
                <span className="text-xs text-neutral-400">{entry.team}</span>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      ) : (
        <p className="mt-6 rounded-lg bg-black/30 px-4 py-3 text-sm text-neutral-400">
          No prior-season history yet to predict from — this unlocks automatically as data
          becomes available.
        </p>
      )}
    </motion.div>
  );
}
