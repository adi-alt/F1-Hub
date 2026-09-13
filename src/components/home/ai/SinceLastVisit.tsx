"use client";

import { motion } from "framer-motion";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

const TYPE_DOT: Record<string, string> = {
  DRIVER: "bg-[var(--f1-red)]",
  TEAM: "bg-[var(--f1-red)]",
  CHAMPIONSHIP: "bg-amber-400",
  PREDICTION: "bg-emerald-400",
  COMMUNITY: "bg-blue-400",
  MODEL: "bg-purple-400",
};

/** A thin strip, not a card - deliberately the lowest-visual-weight element in the Intelligence
 * section (see the redesign brief's own "don't add 10 more cards" rule). Renders nothing for a
 * first-ever visit (sinceLastVisit === null) or once there's genuinely nothing to report. */
export function SinceLastVisit() {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) return null; // no skeleton - this strip should not reserve space speculatively
  const since = intelligence?.sinceLastVisit;
  if (!since || since.changes.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Since you were last here</span>
      <span className="text-xs text-neutral-300">{since.summary}</span>
      <span className="flex items-center gap-2">
        {since.changes.map((c, i) => (
          <span key={i} className="flex items-center gap-1" title={c.explanation}>
            <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[c.type] ?? "bg-neutral-500"}`} />
            <span className="text-[11px] text-neutral-400">{c.title}</span>
          </span>
        ))}
      </span>
    </motion.div>
  );
}
