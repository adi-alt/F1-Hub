"use client";

import type { FocusEvent, MouseEvent } from "react";
import { motion } from "framer-motion";
import { staggerContainer } from "@/components/motion/variants";
import { SeasonCard } from "./SeasonCard";
import type { Era } from "@/lib/eras";
import type { ArchiveYearStats } from "@/lib/supabase/archive";

/** One era's heading over a grid of its seasons - the "years grouped by era" structure the era
 * system exists for, see src/lib/eras.ts. Which years belong to which era is never decided here -
 * groupYearsByEra already resolved that before this ever renders. The era name plus its real year
 * range as a small heading, with `era.description` now underneath as a genuinely visible (if
 * muted, truncated-to-one-line) subtitle rather than only a hover-only `title` attribute - the
 * "years grouped by era" structure is only worth having if a reader can actually tell why these
 * years are grouped together without hovering a heading first. onHoverStart/onHoverEnd just pass
 * straight through to each SeasonCard - the hover state and tooltip panel itself live one level
 * up, in ArchiveSeasonGrid, which is the level with a single anchor spanning every era section. */
export function EraSection({
  era,
  years,
  liveYear,
  yearStats,
  currentLeaderName,
  onCardHoverStart,
  onCardHoverEnd,
}: {
  era: Era;
  years: number[];
  liveYear?: number;
  yearStats: Record<number, ArchiveYearStats>;
  /** The live/in-progress season's own current points leader, if that season falls in this era -
   * see ArchiveSeasonGrid's own comment on why this can't come from `yearStats` (the archive has
   * no rows at all for a season still in progress). */
  currentLeaderName?: string;
  onCardHoverStart: (e: MouseEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>, year: number) => void;
  onCardHoverEnd: (year: number) => void;
}) {
  return (
    <section className="mt-7 first:mt-0">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-300">{era.name}</h2>
        <span className="text-[10px] text-neutral-600">{era.startYear}–{era.endYear ?? "present"}</span>
      </div>
      <p className="mb-3 max-w-2xl truncate text-[11px] text-neutral-600">{era.description}</p>
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {years.map((year) => (
          <SeasonCard
            key={year}
            year={year}
            isLive={year === liveYear}
            raceCount={yearStats[year]?.raceCount}
            leaderName={year === liveYear ? currentLeaderName : yearStats[year]?.driverLeader?.name}
            onHoverStart={onCardHoverStart}
            onHoverEnd={onCardHoverEnd}
          />
        ))}
      </motion.div>
    </section>
  );
}
