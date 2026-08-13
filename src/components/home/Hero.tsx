"use client";

import { motion, type Variants } from "framer-motion";
import { HeroCar } from "@/components/three/HeroCar";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (delay: number) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay, ease: "easeOut" } }),
};

export function Hero() {
  return (
    <section className="relative h-[78vh] min-h-[560px] w-full overflow-hidden">
      <HeroCar />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--background)] via-transparent to-[var(--background)]/40" />
      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-4 pb-14 sm:px-6">
        <motion.p
          initial="hidden"
          animate="show"
          custom={0}
          variants={fadeUp}
          className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]"
        >
          2026 Season
        </motion.p>
        <motion.h1
          initial="hidden"
          animate="show"
          custom={0.1}
          variants={fadeUp}
          className="max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-6xl"
        >
          Every race, every result, every prediction.
        </motion.h1>
        <motion.p
          initial="hidden"
          animate="show"
          custom={0.22}
          variants={fadeUp}
          className="mt-4 max-w-xl text-base text-neutral-300 sm:text-lg"
        >
          F1 Hub tracks the 2026 Formula 1 season end to end: full results, pole positions, and
          standout performances for every race that&apos;s happened, and machine-learning
          predictions for finishing order, pole, and race pace for every race that hasn&apos;t,
          the moment qualifying data exists.
        </motion.p>
        <motion.div
          initial="hidden"
          animate="show"
          custom={0.34}
          variants={fadeUp}
          className="mt-6 flex flex-wrap gap-3 text-sm text-neutral-400"
        >
          <span className="rounded-full border border-[var(--f1-line)] bg-black/30 px-3 py-1">
            Driver &amp; constructor standings
          </span>
          <span className="rounded-full border border-[var(--f1-line)] bg-black/30 px-3 py-1">
            Track history across seasons
          </span>
          <span className="rounded-full border border-[var(--f1-line)] bg-black/30 px-3 py-1">
            Sign in to make your own picks
          </span>
        </motion.div>
      </div>
    </section>
  );
}
