"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";

export type RaceTab = { key: string; label: string };

const MIN_CONTENT_HEIGHT = 220;

/** The race page's own section navigation - tabs (Overview/Results/Qualifying/Strategy/Analysis
 * [/Simulation]) instead of one long scrolling wall of charts, per the user's own closing
 * recommendation. Generalized straight from AnalysisWorkspace.tsx's tab bar (sliding `layoutId`
 * underline over a measured-height crossfade container) - the exact mechanism already proven
 * there, shared via useMeasuredHeight rather than re-implemented. Shared by both the Season and
 * Archive race pages; each passes its own tab list and renders its own content as `children`
 * (only the tabs/underline/crossfade shell is shared - the two pages' actual per-tab content
 * differs because their underlying data does, see the plan's own note on why). */
export function RaceTabShell({
  tabs,
  active,
  onChange,
  children,
}: {
  tabs: RaceTab[];
  active: string;
  onChange: (key: string) => void;
  children: ReactNode;
}) {
  const { ref: measureRef, height } = useMeasuredHeight<HTMLDivElement>(active);

  return (
    <div className="glass-surface overflow-hidden rounded-2xl">
      <div className="flex items-baseline gap-6 overflow-x-auto px-5 pt-4 scrollbar-hide">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={`relative shrink-0 pb-3 text-sm font-medium leading-none transition-colors duration-200 ${isActive ? "text-white" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              {t.label}
              {isActive && (
                <motion.span layoutId="race-tab-underline" className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[var(--f1-red)]" transition={{ duration: 0.2, ease: "easeOut" }} />
              )}
            </button>
          );
        })}
      </div>
      <div className="border-b border-white/[0.07]" />

      <motion.div
        animate={{ height: height ?? MIN_CONTENT_HEIGHT }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        style={{ minHeight: MIN_CONTENT_HEIGHT }}
        className="relative overflow-hidden"
      >
        <div ref={measureRef}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="p-5"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
