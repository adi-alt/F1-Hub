"use client";

import { motion } from "framer-motion";

/** Level 1 - What Happened: the headline + one-paragraph summary, always the first thing shown
 * once generation resolves (real or deterministic - Hero doesn't care which, the section heading
 * above it already carries that distinction). */
export function Hero({ headline, executiveSummary }: { headline: string; executiveSummary: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <p className="text-lg font-semibold leading-snug text-white sm:text-xl">{headline}</p>
      <p className="mt-2 text-sm leading-relaxed text-neutral-300">{executiveSummary}</p>
    </motion.div>
  );
}
