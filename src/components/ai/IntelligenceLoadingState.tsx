"use client";

import { motion } from "framer-motion";
import type { ContextSource } from "@/lib/ai/schemas/raceIntelligence";
import { AnalysisCoverage } from "./AnalysisCoverage";

/** The fix for "how do we show real progress without SSE": the caller already has every field
 * `coverage` is computed from (RaceDoc props, already server-rendered) before this ever mounts, so
 * the checklist below renders instantly with zero network round-trip and zero fabricated per-item
 * server progress. The only genuinely unknown-duration step is the model call itself - "Generating
 * insight..." is the one honest loading line for that. */
export function IntelligenceLoadingState({ coverage }: { coverage: Partial<Record<ContextSource, boolean>> }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="space-y-4">
      <AnalysisCoverage coverage={coverage} mode="checklist" />
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--f1-red)]" />
        Generating insight…
      </div>
    </motion.div>
  );
}
