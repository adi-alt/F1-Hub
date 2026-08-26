"use client";

import Link from "next/link";
import { useState } from "react";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { raceHref } from "@/lib/routes";
import type { RaceSummary } from "../services/season.service";

const STATE_CLASS: Record<RaceSummary["state"], string> = {
  completed: "border border-transparent bg-white/5 text-neutral-500 hover:bg-white/10",
  next: "border border-[var(--f1-red)] bg-[var(--f1-red)]/15 text-[var(--f1-red)]",
  upcoming: "border border-[var(--f1-line)] text-neutral-600 hover:border-white/30",
};

const STATE_ICON: Record<RaceSummary["state"], string> = { completed: "✓", next: "●", upcoming: "○" };

/** One chip per round, not one cell per calendar day — the old heatmap covered a whole year of
 * mostly-empty days; a season only has ~24 races, so a plain horizontal strip shows the entire
 * thing without needing anywhere near that much space. Clicking a race opens its summary inline
 * below the strip instead of navigating away. */
export function SeasonTimeline({ year, raceSummaries }: { year: number; raceSummaries: RaceSummary[] }) {
  const [openRound, setOpenRound] = useState<number | null>(null);
  const scrollRef = useNestedLenisScroll(year, { orientation: "horizontal", gestureOrientation: "horizontal" });
  const opened = raceSummaries.find((r) => r.round === openRound);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Season timeline</p>
      <div ref={scrollRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {raceSummaries.map((r) => (
          <button
            key={r.round}
            onClick={() => setOpenRound((prev) => (prev === r.round ? null : r.round))}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${STATE_CLASS[r.state]} ${
              openRound === r.round ? "ring-1 ring-white/50" : ""
            }`}
          >
            <span aria-hidden>{STATE_ICON[r.state]}</span>
            {r.trackShort}
          </button>
        ))}
      </div>

      {opened && (
        <div className="mt-3 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Round {opened.round}</p>
              <p className="text-lg font-semibold text-white">{opened.name}</p>
            </div>
            <button onClick={() => setOpenRound(null)} aria-label="Close" className="text-neutral-500 transition hover:text-white">
              ×
            </button>
          </div>

          {opened.results.length > 0 ? (
            <>
              <div className="mt-3 flex flex-col gap-1.5">
                {opened.results
                  .filter((r) => r.finishPosition <= 3)
                  .sort((a, b) => a.finishPosition - b.finishPosition)
                  .map((r) => (
                    <div key={r.driver} className="flex items-center justify-between text-sm">
                      <span className="text-white">
                        P{r.finishPosition} {r.driverName}
                      </span>
                      <span className="font-mono tabular-nums text-[var(--f1-red)]">+{r.points}</span>
                    </div>
                  ))}
              </div>
              <Link
                href={raceHref(year, opened.round)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--f1-line)] px-4 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/30 hover:text-white"
              >
                View race →
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">
              {opened.state === "next" ? "Coming up next." : "Not yet run."}
              {opened.raceDate && ` ${new Date(opened.raceDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
