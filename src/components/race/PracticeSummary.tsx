"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { tooltipStyle } from "@/components/charts/chartTheme";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PracticeBestLap, PracticeData } from "@/lib/types/race";

const SESSION_LABELS: Record<"FP1" | "FP2" | "FP3", string> = { FP1: "Practice 1", FP2: "Practice 2", FP3: "Practice 3" };
const TOP_N = 5;

// How far the pace bar dips below "full" for the biggest gap among the shown top 5 - a scanning
// aid, not a literal time-ratio scale. A real practice gap is ~0.01-0.3% of a ~90s lap, which drawn
// to true scale would render every bar as visually identical - this normalizes against the visible
// field's own spread instead, so P1 is always 100% and the widest gap shown always dips to
// 100 - PACE_BAR_SWING%, keeping every bar legible without exaggerating into a "chart."
const PACE_BAR_SWING = 42;

type RosterEntry = { driver: string; driverName: string; team: string };

/** One driver's practice row - position, code, lap time, gap, and a thin pace-bar accent along the
 * row's own bottom edge (not a separate chart row - "underneath" the text, inside the same compact
 * row height, so five of these costs nothing over the old plain list). Hover state lives here, not
 * on the parent - PracticeSummary itself never re-renders when a row is hovered, the same "don't
 * let local hover state force a wider re-render" lesson QualifyingBarChart/PitStopsTimeline already
 * learned, just structural here rather than a useMemo. */
function PaceRow({ lap, index, widthPct, roster }: { lap: PracticeBestLap; index: number; widthPct: number; roster: Map<string, RosterEntry> }) {
  const [hovered, setHovered] = useState(false);
  const isFastest = index === 0;
  const info = roster.get(lap.driver);

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.035, ease: "easeOut" }}
      className="relative flex items-center gap-2 rounded-md px-1.5 py-1"
      style={{ background: hovered ? "rgba(255,255,255,0.035)" : "transparent", transform: hovered ? "translateX(2px)" : "translateX(0)", transition: "background 180ms ease, transform 180ms ease" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="w-3.5 shrink-0 text-xs text-neutral-500">{index + 1}</span>
      <span className={`w-11 shrink-0 text-sm font-medium ${isFastest ? "text-white" : "text-neutral-200"}`}>{lap.driver}</span>
      <span className="flex-1" />
      <span className={`whitespace-nowrap font-mono text-[13px] ${isFastest ? "text-white" : "text-neutral-300"}`}>{lap.lapTimeSec.toFixed(3)}s</span>
      <span className="w-14 shrink-0 whitespace-nowrap text-right text-[11px]">
        {isFastest ? (
          <span className="font-semibold uppercase tracking-wider text-[var(--f1-red)]">Fastest</span>
        ) : (
          <span className="text-neutral-500">+{lap.deltaToBestSec.toFixed(3)}</span>
        )}
      </span>

      {/* The pace bar itself - width normalized against this field's own max gap (see
          PACE_BAR_SWING), color/opacity is the "subtle accent treatment" for P1 vs everyone else. */}
      <span
        className="pointer-events-none absolute bottom-0 left-1.5 h-[2px] rounded-full"
        style={{
          width: `calc(${widthPct}% - 12px)`,
          background: isFastest ? "var(--f1-red)" : "#ffffff",
          opacity: isFastest ? (hovered ? 0.55 : 0.4) : hovered ? 0.28 : 0.16,
          transition: "opacity 180ms ease",
        }}
      />

      {hovered && info && (
        <div
          className="pointer-events-none absolute left-1.5 top-full z-10 mt-1.5 w-44 rounded-lg border px-2.5 py-2 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
          style={{
            background: tooltipStyle.background,
            backdropFilter: tooltipStyle.backdropFilter,
            WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter,
            borderColor: "var(--tooltip-border)",
          }}
        >
          <p className="font-semibold text-white">{info.driverName}</p>
          <p className="text-neutral-500">{info.team}</p>
          <p className="mt-1.5 font-mono text-neutral-300">{lap.lapTimeSec.toFixed(3)}s</p>
          <p className="text-neutral-500">{isFastest ? "Pole benchmark" : `Gap: +${lap.deltaToBestSec.toFixed(3)}s`}</p>
        </div>
      )}
    </motion.li>
  );
}

/** `race.practice` has always been fetched (see pipeline/fetch_races.py's fetch_practice) but,
 * per its own schema comment, was "ML-feature-only, never read by the app's own RaceDoc type" —
 * this is that data's real display. Sprint weekends only ever have FP1 (no FP2/FP3), so this
 * renders whatever subset actually exists rather than assuming all three.
 *
 * `roster` (optional - race.inputs or race.results, whichever the caller already has in scope) is
 * only ever used to resolve a 3-letter practice code into a full name/team for the hover tooltip -
 * PracticeBestLap itself carries neither, and there's no reliable driver-id to link a row to (see
 * this file's own reasoning: a guessed id from a 3-letter code risks a wrong or dead link, which is
 * exactly the "fake interaction" this intentionally avoids), so rows highlight and show a tooltip
 * on hover but don't navigate anywhere. */
export function PracticeSummary({ practice, roster = [] }: { practice: PracticeData; roster?: RosterEntry[] }) {
  const sessions = (["FP1", "FP2", "FP3"] as const).filter((key) => practice[key]);
  if (sessions.length === 0) return null;
  const rosterMap = new Map(roster.map((r) => [r.driver, r]));

  return (
    <div className="grid items-stretch gap-3 sm:grid-cols-3">
      {sessions.map((key, sessionIndex) => {
        const session = practice[key]!;
        const topLaps = [...session.bestLaps].sort((a, b) => a.lapTimeSec - b.lapTimeSec).slice(0, TOP_N);
        const maxGap = Math.max(...topLaps.map((l) => l.deltaToBestSec), 0.001);
        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: sessionIndex * 0.05, ease: "easeOut" }}
            className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5 transition-[background-color,border-color] duration-200 hover:-translate-y-px hover:border-white/[0.14] hover:bg-[var(--f1-carbon)]/80"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{SESSION_LABELS[key]}</p>
            <ol>
              {topLaps.map((lap, i) => (
                <PaceRow key={lap.driver} lap={lap} index={i} widthPct={100 - (lap.deltaToBestSec / maxGap) * PACE_BAR_SWING} roster={rosterMap} />
              ))}
            </ol>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Matches PracticeSummary's real layout exactly (three cards, five compact rows each, a thin
 * pace-bar sliver per row) so swapping the real content in causes no layout shift. Not currently
 * wired into race/loading.tsx - practice arrives with the rest of RaceDoc on the initial server
 * render, there's no separate client fetch for it to skeleton against - exported so a future
 * client-side loading state (or a Suspense boundary around just this panel) has a ready match. */
export function PracticeSummarySkeleton() {
  return (
    <div className="grid items-stretch gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, cardIndex) => (
        <div key={cardIndex} className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5">
          <Skeleton className="mb-2.5 h-3 w-20 bg-white/[0.06]" />
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <div key={rowIndex} className="flex items-center gap-2 px-1.5 py-1">
                <Skeleton className="h-3 w-2.5 bg-white/[0.06]" />
                <Skeleton className="h-3.5 w-9 bg-white/[0.06]" />
                <span className="flex-1" />
                <Skeleton className="h-3.5 w-14 bg-white/[0.06]" />
                <Skeleton className="h-3 w-9 bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
