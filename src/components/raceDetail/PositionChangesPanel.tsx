"use client";

import { motion } from "framer-motion";
import { chart, SESSION_ROW_HEIGHT } from "@/components/charts/chartTheme";

export type PositionChangeEntry = { code: string; grid: number; finish: number; movement: number };

/** Compact "grid -> finish" row list - replaces the old full-width MovementChart diverging-bar
 * treatment (Season) so this can sit as a peer column next to Qualifying/Strategy instead of its
 * own separate full-width section. Same real data (grid position, finishing position), same
 * filtering convention MovementChart already used - DNFs and zero-movement drivers excluded (a
 * driver who didn't move isn't a "position change" worth showing), sorted biggest gainer first.
 * Shared by Season and Archive's race pages - each maps its own real result rows down to this one
 * plain shape at the call site (same "shared presentation, adapt at the call site" pattern
 * RaceHeader/RacePodium/RaceResultsTable already use). */
export function PositionChangesPanel({ entries }: { entries: PositionChangeEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-neutral-500">No position changes to show.</p>;

  return (
    <div>
      {entries.map((e, i) => (
        <div key={e.code} className="flex items-center gap-2" style={{ height: SESSION_ROW_HEIGHT }}>
          <span className="w-12 shrink-0 text-sm font-medium text-white">{e.code}</span>
          <span className="w-6 shrink-0 text-right font-mono text-xs text-neutral-500">P{e.grid}</span>
          {/* A thin connecting line, not just an arrow glyph - animates in once (left to right,
              staggered per row) so the "grid -> finish" relationship reads as a real movement,
              not a static label pair. */}
          <motion.div
            className="h-px min-w-4 flex-1 bg-white/15"
            style={{ transformOrigin: "left" }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
          />
          <span className="w-6 shrink-0 font-mono text-xs text-neutral-500">P{e.finish}</span>
          <span className="w-9 shrink-0 text-right font-mono text-xs font-semibold" style={{ color: e.movement > 0 ? chart.sequentialBlue : chart.divergingRed }}>
            {e.movement > 0 ? `+${e.movement}` : e.movement}
          </span>
        </div>
      ))}
    </div>
  );
}
