"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";

const features = [
  {
    title: "Three models, one grid",
    body:
      "Finishing order, pole position, and race pace are predicted by three separate Random Forest models, each trained and walk-forward validated on its own — not one model wearing three hats.",
  },
  {
    title: "A full range of outcomes, not one guess",
    body:
      "A Monte Carlo simulator runs each race 10,000 times, sampling grid, pace, and DNF risk with correlated noise (a driver's bad day often means their teammate's bad day too) to produce real win/podium probabilities.",
  },
  {
    title: "Real telemetry since 2018",
    body:
      "Every prediction is trained on actual FastF1 session data — lap times, tyre compounds, qualifying gaps — across every race since 2018, not scraped headlines or vibes.",
  },
  {
    title: "Tested against every race, honestly",
    body:
      "Every model is benchmarked on a chronological walk-forward backtest before it ships — trained only on races that happened before the one it's scored against, the same discipline a real forecaster would hold itself to.",
  },
];

export function AboutSection() {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={staggerContainer}
      className="grid gap-4 sm:grid-cols-2"
    >
      {features.map((feature) => (
        <motion.div
          key={feature.title}
          variants={staggerItem}
          className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6"
        >
          <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">{feature.body}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
