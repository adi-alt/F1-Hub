"use client";

import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { staggerContainer, staggerItem } from "@/components/motion/variants";

// Framed as a timing tower — position, stat, then the "gap" line, the same visual grammar F1
// broadcasts already use for standings — rather than another generic feature-card grid.
const rows = [
  {
    stat: "3",
    unit: "models",
    title: "Finish, pole, and pace — three separate calls",
    body: "Each a Random Forest, each walk-forward validated on its own, not one model wearing three hats.",
  },
  {
    stat: "10,000",
    unit: "sims / race",
    title: "A range of outcomes, not one guess",
    body: "A Monte Carlo simulator samples pace and DNF risk with correlated noise — a driver's bad day often means their teammate's too.",
  },
  {
    stat: "184+",
    unit: "races",
    title: "Real telemetry, since 2018",
    body: "Lap times, tyre compounds, qualifying gaps — actual FastF1 session data, not scraped headlines.",
  },
  {
    stat: "0",
    unit: "shortcuts",
    title: "Backtested before it ships",
    body: "Every model is scored on races it never trained on — the same discipline a real forecaster is held to.",
  },
];

export function AboutSection() {
  const { user, signInWithGoogle } = useAuth();

  return (
    <div>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        className="overflow-hidden rounded-2xl border border-[var(--f1-line)]"
      >
        {rows.map((row, i) => (
          <motion.div
            key={row.title}
            variants={staggerItem}
            whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
            className="group relative flex flex-col gap-4 border-b border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-5 last:border-b-0 sm:flex-row sm:items-center sm:gap-6"
          >
            <span
              aria-hidden
              className="absolute left-0 top-0 h-full w-0.5 bg-[var(--f1-red)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
            <div className="flex items-baseline gap-3 sm:w-40 sm:shrink-0">
              <span className="text-xs font-semibold tabular-nums text-neutral-500">P{i + 1}</span>
              <span className="text-2xl font-bold tabular-nums text-white">{row.stat}</span>
              <span className="text-xs uppercase tracking-wide text-neutral-500">{row.unit}</span>
            </div>
            <div>
              <h3 className="font-semibold text-white">{row.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{row.body}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {!user && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-6 py-5">
          <p className="text-sm text-neutral-400">See it running on the current season.</p>
          <button
            onClick={() => void signInWithGoogle()}
            className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
          >
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
}
