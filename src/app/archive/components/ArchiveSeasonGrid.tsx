"use client";

import type { FocusEvent, MouseEvent } from "react";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { staggerContainer } from "@/components/motion/variants";
import { groupYearsByEra, isVerifiedChampionYear } from "@/lib/eras";
import type { ArchiveYearStats, CurrentLeader } from "@/lib/supabase/archive";
import { SeasonCard } from "./SeasonCard";
import { EraSection } from "./EraSection";

const TOOLTIP_WIDTH = 210;

type Hover = { year: number; top: number; left: number; flipBelow: boolean };

/** Years grouped by era (see src/lib/eras.ts - nothing here compares a year against a literal
 * number, groupYearsByEra already resolved the grouping). The live/current season - not part of
 * `years` at all, the archive only covers seasons through last year - folds into whichever era it
 * actually belongs to (eraForYear resolves it the same as any other year) rather than getting a
 * separate hero treatment; SeasonCard's `isLive` just swaps its link to /season and adds a small
 * dot, same size as every other card.
 *
 * Also owns the champion/leader hover tooltip - one lifted hover state plus one absolutely-
 * positioned panel, the exact pattern SeasonCalendar.tsx already uses for its own day tooltip
 * (anchorRef + getBoundingClientRect + flip-above/below), rather than a per-card portal. Text
 * only, deliberately - no driver photo/team logo (Archive is the restrained, statistical/reference
 * counterpart to Season's richer identity-driven cards, not a second place doing the same thing;
 * see SeasonCard's own comment). Content is resolved here, not hardcoded per year:
 * isVerifiedChampionYear(year) is the one place that decides "Champion" (1991+, the real full-
 * season-sum rule) vs "Most Points" (1950-1990, a real sum that isn't guaranteed to match the
 * actual champion under F1's real scoring rule for that span - see src/lib/supabase/archive.ts).
 * The live year never gets a fabricated "champion" - it shows `currentLeader`, this year's real,
 * still-changing points leader. */
export function ArchiveSeasonGrid({
  years,
  currentYear,
  showLiveSeason,
  yearStats,
  currentLeader,
}: {
  years: number[];
  currentYear: number;
  showLiveSeason: boolean;
  yearStats: Record<number, ArchiveYearStats>;
  currentLeader: CurrentLeader;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  function showTooltip(e: MouseEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>, year: number) {
    const cardRect = e.currentTarget.getBoundingClientRect();
    const anchorRect = anchorRef.current?.getBoundingClientRect();
    if (!anchorRect) return;
    const idealLeft = cardRect.left - anchorRect.left + cardRect.width / 2 - TOOLTIP_WIDTH / 2;
    const left = Math.max(4, Math.min(idealLeft, anchorRect.width - TOOLTIP_WIDTH - 4));
    const top = cardRect.top - anchorRect.top;
    const bottom = cardRect.bottom - anchorRect.top;
    const flipBelow = cardRect.top - 150 < 0;
    setHover({ year, top: flipBelow ? bottom : top, left, flipBelow });
  }
  function hideTooltip(year: number) {
    setHover((prev) => (prev?.year === year ? null : prev));
  }

  const allYears = showLiveSeason && !years.includes(currentYear) ? [currentYear, ...years] : years;
  const groups = groupYearsByEra(allYears);
  const hoverIsLive = hover?.year === currentYear && showLiveSeason;
  const hoverStats = hover && !hoverIsLive ? yearStats[hover.year] : undefined;

  return (
    <div ref={anchorRef} className="relative pb-2">
      {/* Single era, single group - the common case when a filter's active - doesn't need its own
          heading repeating what the filter trigger already says. */}
      {groups.length === 1 ? (
        <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {groups[0].years.map((year) => (
            <SeasonCard
              key={year}
              year={year}
              isLive={showLiveSeason && year === currentYear}
              raceCount={yearStats[year]?.raceCount}
              onHoverStart={showTooltip}
              onHoverEnd={hideTooltip}
            />
          ))}
        </motion.div>
      ) : (
        groups.map(({ era, years: eraYears }) => (
          <EraSection
            key={era.id}
            era={era}
            years={eraYears}
            liveYear={showLiveSeason ? currentYear : undefined}
            yearStats={yearStats}
            onCardHoverStart={showTooltip}
            onCardHoverEnd={hideTooltip}
          />
        ))
      )}

      <AnimatePresence>
        {hover && (
          <div
            className="pointer-events-none absolute z-30"
            style={{
              top: hover.flipBelow ? hover.top + 8 : hover.top - 8,
              left: hover.left,
              width: TOOLTIP_WIDTH,
              transform: hover.flipBelow ? undefined : "translateY(-100%)",
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: hover.flipBelow ? -4 : 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: hover.flipBelow ? -4 : 4, scale: 0.98 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="glass-surface rounded-lg p-3"
            >
              <p className="text-sm font-semibold text-white">{hover.year}</p>
              {hoverIsLive ? (
                currentLeader.driver || currentLeader.team ? (
                  <>
                    <p className="mt-0.5 text-[11px] text-neutral-500">Season in progress</p>
                    <div className="mt-2.5 space-y-2">
                      {currentLeader.driver && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Current Drivers&rsquo; Leader</p>
                          <p className="truncate text-sm text-white">{currentLeader.driver.name}</p>
                        </div>
                      )}
                      {currentLeader.team && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Current Constructors&rsquo; Leader</p>
                          <p className="truncate text-sm text-white">{currentLeader.team.name}</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-0.5 text-[11px] text-neutral-500">Season in progress. No standings yet.</p>
                )
              ) : hoverStats?.driverLeader || hoverStats?.teamLeader ? (
                <>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {hoverStats.raceCount} race{hoverStats.raceCount === 1 ? "" : "s"} · Season complete
                  </p>
                  <div className="mt-2.5 space-y-2">
                    {hoverStats.driverLeader && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                          {isVerifiedChampionYear(hover.year) ? "Drivers’ Champion" : "Most Points (Driver)"}
                        </p>
                        <p className="truncate text-sm text-white">{hoverStats.driverLeader.name}</p>
                      </div>
                    )}
                    {hoverStats.teamLeader && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                          {isVerifiedChampionYear(hover.year) ? "Constructors’ Champion" : "Most Points (Team)"}
                        </p>
                        <p className="truncate text-sm text-white">{hoverStats.teamLeader.name}</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-0.5 text-[11px] text-neutral-500">No results recorded.</p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
