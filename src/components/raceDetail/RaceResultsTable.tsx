"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { teamColor } from "@/lib/teamColors";

export type RaceResultRow = {
  key: string;
  positionText: string; // "1", "12", "R", "DNF" - already display-ready
  driverName: string;
  team: string;
  statusLabel: string; // "Finished", "Retired", "+1 Lap", ...
  secondaryLabel: string; // "+12.773s", "Lap 42", "Leader", "Pole", ... - context-dependent
  points: number | null;
  fastestLap?: boolean;
};

/** Table-like divided rows - the same language as the Season Championship table's own `<tbody>`
 * (see ChampionshipStandings.tsx: `divide-y divide-[var(--f1-line)]`, `hover:bg-white/[0.035]`,
 * a colored left border instead of a tinted fill) rather than each row painting its own rounded,
 * bordered, gapped card. Team identity is still the 3px left-border accent - color as information,
 * not decoration - it just no longer needs its own background/radius to read as a distinct row,
 * since the divider between rows already does that job. Shared by Season and Archive's race pages
 * (both map their own real result rows down to this one plain shape at the call site - see
 * RaceHeader's own comment for why the shared component doesn't know either page's real data type).
 *
 * `renderExpanded`/`expandedKey`/`onToggleExpand` are optional - Archive's click-to-expand
 * qualifying/pit-stop cross-reference (a real, kept feature) plugs into that slot; Season's
 * simpler usage just omits all three and gets a plain (non-clickable) list. */
export function RaceResultsTable({
  rows,
  renderExpanded,
  expandedKey,
  onToggleExpand,
}: {
  rows: RaceResultRow[];
  renderExpanded?: (key: string) => ReactNode;
  expandedKey?: string | null;
  onToggleExpand?: (key: string) => void;
}) {
  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
      {rows.map((r) => {
        const color = teamColor(r.team);
        const isOpen = expandedKey === r.key;
        const clickable = !!onToggleExpand;
        return (
          <motion.div key={r.key} variants={staggerItem} className="overflow-hidden border-l-[3px]" style={{ borderLeftColor: color }}>
            <button
              type="button"
              onClick={clickable ? () => onToggleExpand(r.key) : undefined}
              className={`flex w-full items-center gap-3 py-2 pl-3 pr-3 text-left transition ${clickable ? "cursor-pointer hover:bg-white/[0.035]" : ""}`}
            >
              <span className="w-7 shrink-0 text-sm font-bold text-white">{r.positionText}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-white">{r.driverName}</span>
                  {r.fastestLap && (
                    <span className="shrink-0 rounded bg-[var(--f1-red)]/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--f1-red)]">FL</span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-neutral-500">{r.team}</span>
              </span>
              <span className="hidden shrink-0 text-xs text-neutral-400 sm:block">{r.statusLabel}</span>
              <span className="w-20 shrink-0 text-right text-xs text-neutral-400">{r.secondaryLabel}</span>
              <span className="w-12 shrink-0 text-right text-xs text-neutral-500">{r.points && r.points > 0 ? `${r.points} pts` : ""}</span>
              {clickable && (
                <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" aria-hidden>
                  <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
            {clickable && (
              <AnimatePresence>
                {isOpen && renderExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                    {renderExpanded(r.key)}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
