"use client";

import { motion } from "framer-motion";

/** Rank + name + proportional bar + real count - the same visual language SimulationPanel's own
 * ProbabilityBars uses for win/podium probability, just for a raw count instead of a percentage
 * (that component's own label formatting - `.toFixed(0)%` - is specific to probabilities, not
 * reusable as-is for a count). Shared by Track Intelligence's own driver win list and the race
 * history explorer's Drivers/Teams tabs - one bar-list component, not three near-identical copies. */
export function WinnersBarList({ entries, unit = "win" }: { entries: { name: string; count: number }[]; unit?: string }) {
  const max = Math.max(...entries.map((e) => e.count), 1);
  return (
    <div>
      {entries.map((e, i) => (
        <motion.div
          key={e.name}
          initial={{ opacity: 0, x: -6 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, delay: i * 0.03 }}
          className="flex items-center gap-2.5 py-[3px]"
        >
          <span className="w-4 shrink-0 text-right font-mono text-[11px] text-neutral-600">{i + 1}</span>
          {/* Full names here (a driver or a team), not a 3-letter code - a fixed w-40 rather than
              ProbabilityBars' own w-12, wide enough for "Michael Schumacher" (confirmed live at
              w-32 it still clipped to "Schumac…") - truncate stays as the graceful fallback for
              the rare longer name, not chased further than this. */}
          <span className="w-40 shrink-0 truncate text-sm font-medium text-white">{e.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full w-full origin-left rounded-full"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: e.count / max }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ background: "var(--f1-red)" }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs text-neutral-500">
            {e.count} {e.count === 1 ? unit : `${unit}s`}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
