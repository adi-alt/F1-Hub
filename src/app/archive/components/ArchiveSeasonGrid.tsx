"use client";

import type { FocusEvent, MouseEvent } from "react";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
 * Also owns the champion/leader hover tooltip. Portaled straight to document.body (not an
 * absolutely-positioned child of a local anchor) - the grid lives inside ArchiveExplorer's own
 * overflow-y-auto scroll region, which was clipping the tooltip whenever it didn't fit inside that
 * region's own bounds. `position: fixed` + coordinates from the hovered card's own
 * getBoundingClientRect() escapes that entirely, the same way EntityMultiSelect/SearchableSelect's
 * own dropdowns already do. useSyncExternalStore (not a useEffect+setState "mounted" flag) defers
 * the portal to the client without ever touching `document` during SSR - the exact crash fixed
 * twice already this session for the exact same createPortal(..., document.body) shape; not
 * repeating it a third time here. Horizontally clamped to the viewport, flips above/below based on
 * available room, same decision SearchableSelect's own dropdown already makes.
 *
 * Content is resolved here, not hardcoded per year: isVerifiedChampionYear(year) is the one place
 * that decides "Champion" (1991+, the real full-season-sum rule) vs "Most Points" (1950-1990, a
 * real sum that isn't guaranteed to match the actual champion under F1's real scoring rule for that
 * span - see src/lib/eras.ts). The live year never gets a fabricated "champion" - it shows
 * `currentLeader`, this year's real, still-changing points leader. Text only, deliberately - no
 * driver photo/team logo (see SeasonCard's own comment on why). */
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
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  function showTooltip(e: MouseEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>, year: number) {
    const r = e.currentTarget.getBoundingClientRect();
    const idealLeft = r.left + r.width / 2 - TOOLTIP_WIDTH / 2;
    const left = Math.max(8, Math.min(idealLeft, window.innerWidth - TOOLTIP_WIDTH - 8));
    const flipBelow = r.top < 160; // not enough room above for the tooltip's own rough height
    setHover({ year, top: flipBelow ? r.bottom + 8 : r.top - 8, left, flipBelow });
  }
  function hideTooltip(year: number) {
    setHover((prev) => (prev?.year === year ? null : prev));
  }

  const allYears = showLiveSeason && !years.includes(currentYear) ? [currentYear, ...years] : years;
  const groups = groupYearsByEra(allYears);
  const hoverIsLive = hover?.year === currentYear && showLiveSeason;
  const hoverStats = hover && !hoverIsLive ? yearStats[hover.year] : undefined;

  return (
    <div className="pb-2">
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

      {isClient &&
        createPortal(
          <AnimatePresence>
            {hover && (
              // Static positioning (including the translateY(-100%) flip-above) lives on this
              // plain, non-animated wrapper - separate from the motion.div's own animated y/scale
              // transform below. Framer Motion owns the `transform` CSS property on any element it
              // animates y/scale on; a static transform set in the *same* style object gets
              // silently overwritten the instant the animation runs, which is exactly why the
              // tooltip was rendering on top of the card instead of above it. Same fix
              // SeasonCalendar.tsx's own tooltip already uses, for the identical reason.
              <div
                className="pointer-events-none fixed z-[300]"
                style={{
                  top: hover.top,
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
                  className="rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3"
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
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
