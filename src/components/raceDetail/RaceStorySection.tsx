"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { RaceSectionCard } from "./RaceSectionCard";
import { RaceStory, type RaceStoryFacts } from "./RaceStory";
import type { StatTile } from "./StatTiles";

/** Flat "label / value" pairs in a 2x2 grid with hairline dividers between cells, not StatTiles'
 * own bordered-card treatment - four separate boxed cards read as heavier and taller than the
 * bullet list sitting right above them, which is exactly what left this whole section looking
 * top-heavy on the left and empty on the right. Same `StatTile` shape both dashboards already
 * build (label/value/sub) - only the renderer changes, not the data. Hardcoded to a 2-column,
 * 2-row layout (not a generic N-item grid) because both call sites always pass exactly these four
 * (Pole/Fastest Lap/Margin/DNFs) - a general-purpose grid would be solving a problem this doesn't
 * actually have. */
function CompactStatGrid({ tiles }: { tiles: StatTile[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mt-5 grid grid-cols-2 border-t border-[var(--f1-line)] pt-3.5"
    >
      {tiles.map((t, i) => (
        <div
          key={t.label}
          className={[i % 2 === 1 ? "border-l border-[var(--f1-line)] pl-5" : "pr-5", i >= 2 ? "mt-3.5 border-t border-[var(--f1-line)] pt-3.5" : ""].join(" ")}
        >
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">{t.label}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{t.value}</p>
          {t.sub && <p className="text-[11px] text-neutral-500">{t.sub}</p>}
        </div>
      ))}
    </motion.div>
  );
}

/** Race Story's own section - highlights + compact stats on the left, the circuit card on the
 * right, sized 2.1fr/0.9fr (the circuit card's own real content - a wide image, a name, a weather
 * line, a button - never needs as much room as it was getting at an even split) and `items-start`
 * (not the grid default `stretch`) so the shorter of the two never gets stretched to match the
 * taller - the empty space that stretch used to leave under the left column when the circuit card
 * ran taller is exactly the "large empty area" this replaces. `minmax(300px, 0.9fr)` keeps the
 * circuit column from getting too narrow to read at in-between viewport widths, without a fixed
 * px width that would ignore how much room is actually available.
 *
 * `circuitCard` is a slot, not a shared component - Season's SeasonConditionsCard and Archive's
 * CircuitCard (+ its own "not backfilled yet" fallback) are genuinely different enough (real
 * min/max/precipitation weather vs. a single day's reading) that forcing one shared circuit
 * component here would just be a wrapper around two anyway - same "adapt at the call site" shape
 * RaceHeader/RacePodium/RaceResultsTable already use. */
export function RaceStorySection({ storyFacts, statTiles, circuitCard }: { storyFacts: RaceStoryFacts | null; statTiles: StatTile[] | null; circuitCard: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, ease: "easeOut" }}>
      <RaceSectionCard title="Race Story" description="Key moments and highlights from the race.">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(300px,0.9fr)]">
          <div>
            {storyFacts && <RaceStory facts={storyFacts} />}
            {statTiles && <CompactStatGrid tiles={statTiles} />}
          </div>
          <motion.div initial={{ opacity: 0, x: 8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
            {circuitCard}
          </motion.div>
        </div>
      </RaceSectionCard>
    </motion.div>
  );
}

/** Mirrors the real layout exactly (same grid columns, same rough left-column height as four
 * highlight lines + a 2x2 stat grid, same right-column shape as a compact circuit card) - not
 * generic rectangles, so there's no layout jump the instant real data replaces this. Used by
 * race/loading.tsx, the one real Suspense boundary this page has (every other section here is
 * server-rendered synchronously once that resolves, so this is the only skeleton on the page with
 * anything genuine to cover). */
export function RaceStorySectionSkeleton() {
  return (
    <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4 sm:p-5">
      <Skeleton className="skeleton-shimmer h-3 w-20" />
      <Skeleton className="skeleton-shimmer mt-2 h-3 w-56" />
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(300px,0.9fr)]">
        <div>
          <Skeleton className="skeleton-shimmer h-3 w-28" />
          <div className="mt-3 space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-3.5" style={{ width: `${85 - i * 8}%` }} />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3.5 border-t border-[var(--f1-line)] pt-3.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="skeleton-shimmer h-2.5 w-20" />
                <Skeleton className="skeleton-shimmer mt-1.5 h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="skeleton-shimmer h-32 w-full rounded-lg" />
          <Skeleton className="skeleton-shimmer mt-3 h-2.5 w-16" />
          <Skeleton className="skeleton-shimmer mt-1.5 h-4 w-40" />
          <Skeleton className="skeleton-shimmer mt-3 h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
