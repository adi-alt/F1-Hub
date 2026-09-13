"use client";

import { AnimatePresence, motion } from "framer-motion";
import { chart } from "@/components/charts/chartTheme";

// driverId is real (Ergast's own id for Archive, the 3-letter code for Season) - used only for
// the shared Custom driver-picker to filter against, never displayed; `code` is the display label.
export type PositionChangeEntry = { code: string; driverId: string; grid: number; finish: number; movement: number };

const ROW_HEIGHT = 36;
// The track reserves this much room on both ends (in rem) so a dot sitting at the very edge of the
// scale (P1 or P{fieldSize}) still has space for its own outward-pointing label without spilling
// into the driver-code/delta columns on either side.
const TRACK_INSET_REM = 2.5;

function trackColor(movement: number): string {
  if (movement > 0) return chart.sequentialGreen;
  if (movement < 0) return chart.divergingRed;
  return chart.mutedInk;
}

// `left: X%` on an absolutely-positioned child is a percentage of the *whole* containing box, not
// just its content area - so mapping a 0..1 fraction onto an inset [inset, width-inset] range needs
// a mixed unit calc() (a fixed rem offset plus a fraction of the remaining percentage width), not a
// plain percentage. Kept as two small helpers rather than inlined - the width one is a difference
// of two of these, which reads a lot clearer as its own named thing than repeated inline calc().
function trackLeft(fraction: number): string {
  return `calc(${TRACK_INSET_REM}rem + (100% - ${TRACK_INSET_REM * 2}rem) * ${fraction})`;
}
function trackWidth(fromFraction: number, toFraction: number): string {
  return `calc((100% - ${TRACK_INSET_REM * 2}rem) * ${toFraction - fromFraction})`;
}

/** A real "grid -> finish" position track, not a fixed-length decorative line - every row plots
 * its two dots on the SAME P1..P{fieldSize} scale (fieldSize is the whole race's field, not just
 * the currently-visible subset, so switching Top 5 -> All never rescales the axis underneath
 * already-visible rows) - "use a consistent visual scale... do not make the visualization
 * misleading" is exactly what a fixed-length arrow regardless of actual gap would violate. Outlined
 * circle = grid (start), filled circle = finish - always in that role regardless of which one lands
 * further left/right, so gainers (finish left of grid) and losers (finish right of grid) both read
 * correctly. Labels sit outside whichever dot is outermost on each side, never between the two
 * dots, so they can't collide with each other regardless of how close together the two positions
 * are. */
export function PositionChangesPanel({ entries, fieldSize }: { entries: PositionChangeEntry[]; fieldSize: number }) {
  if (entries.length === 0) return <p className="text-sm text-neutral-500">No classified results to compare.</p>;

  const span = Math.max(fieldSize - 1, 1);
  const fractionOf = (position: number) => (position - 1) / span;

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span className="w-12 shrink-0" />
        <div className="relative h-3 flex-1">
          <span className="absolute font-mono text-[10px] text-neutral-600" style={{ left: trackLeft(0), transform: "translateX(-50%)" }}>
            P1
          </span>
          <span className="absolute font-mono text-[10px] text-neutral-600" style={{ left: trackLeft(1), transform: "translateX(-50%)" }}>
            P{fieldSize}
          </span>
        </div>
        <span className="w-10 shrink-0" />
      </div>
      <AnimatePresence initial={false}>
        {entries.map((e, i) => {
          const startFraction = fractionOf(e.grid);
          const endFraction = fractionOf(e.finish);
          const leftFraction = Math.min(startFraction, endFraction);
          const rightFraction = Math.max(startFraction, endFraction);
          const color = trackColor(e.movement);
          const noChange = e.movement === 0;

          return (
            <motion.div
              key={e.driverId}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, delay: i * 0.015, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="w-12 shrink-0 text-sm font-medium text-white">{e.code}</span>
              <div className="relative h-5 flex-1">
                <div className="absolute top-1/2 h-px -translate-y-1/2 bg-white/[0.06]" style={{ left: trackLeft(0), right: trackLeft(0) }} />
                {noChange ? (
                  <>
                    <span
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[var(--f1-carbon)]"
                      style={{ left: trackLeft(startFraction), borderColor: color }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-neutral-500"
                      style={{ left: trackLeft(startFraction), transform: "translate(10px, -50%)" }}
                    >
                      P{e.grid}
                    </span>
                  </>
                ) : (
                  <>
                    <motion.div
                      className="absolute top-1/2 h-px -translate-y-1/2"
                      style={{ left: trackLeft(leftFraction), width: trackWidth(leftFraction, rightFraction), background: color, transformOrigin: startFraction <= endFraction ? "left" : "right" }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.45, delay: i * 0.015 + 0.1, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <span
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[var(--f1-carbon)]"
                      style={{ left: trackLeft(startFraction), borderColor: color }}
                    />
                    <span
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ left: trackLeft(endFraction), background: color }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-neutral-500"
                      style={{ left: trackLeft(leftFraction), transform: "translate(calc(-100% - 8px), -50%)" }}
                    >
                      P{leftFraction === startFraction ? e.grid : e.finish}
                    </span>
                    <span
                      className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-neutral-500"
                      style={{ left: trackLeft(rightFraction), transform: "translate(8px, -50%)" }}
                    >
                      P{rightFraction === startFraction ? e.grid : e.finish}
                    </span>
                  </>
                )}
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-xs font-semibold" style={{ color }}>
                {noChange ? "–" : e.movement > 0 ? `+${e.movement}` : e.movement}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
