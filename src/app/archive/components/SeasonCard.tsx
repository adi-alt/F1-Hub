"use client";

import type { FocusEvent, MouseEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/motion/variants";
import { archiveSeasonHref } from "@/lib/routes";

/** One season, as a compact selectable badge - deliberately still not a mini dashboard (the full
 * champion/leader/constructor breakdown belongs in the hover tooltip ArchiveSeasonGrid owns), but
 * no longer just a year and a race count either: a season's real headline name (leaderName - the
 * points leader ArchiveSeasonGrid already resolved from getArchiveYearStats, honest either way -
 * see isVerifiedChampionYear) is worth showing without requiring hover/touch to discover it at
 * all, especially since touch devices have no hover. Fixed height (h-20), not auto-sized to which
 * lines actually render - `flex-col justify-center` already centers 1/2/3 lines so every card is
 * the same geometry regardless of year/race-count/leader-name/live-state, rather than a card with
 * less data reading as visibly shorter than its neighbours. `isLive` is the one exception in kind,
 * not size: the in-progress season gets a small pulsing dot, links to /season instead of
 * /archive?year=, and its third line is "In progress" (never a name asserted as final) until
 * `leaderName` actually has this year's real, still-changing leader. Translucent zinc (border +
 * bg-[var(--f1-carbon)]/60), not `.glass-surface` - with ~76 of these on screen at once, a real
 * backdrop-blur per card is real, unnecessary compositing cost, and this is also the same flat
 * translucent surface ArchiveTable and the "by track" grid both use, so every browse surface in
 * Archive reads as one consistent family instead of the cards looking heavier/glassier than
 * everything around them. onHoverStart/onHoverEnd wire the fuller champion/leader/constructor
 * tooltip (mouse *and* focus/blur, same pattern SeasonCalendar's DayCell already uses, so keyboard
 * users get it too) - deliberately still no driver photo/team logo on the card itself (see
 * ArchiveSeasonGrid's own comment on why). */
export function SeasonCard({
  year,
  isLive = false,
  raceCount,
  leaderName,
  onHoverStart,
  onHoverEnd,
}: {
  year: number;
  isLive?: boolean;
  raceCount?: number;
  /** The real points/driver leader's name, already resolved server-side - undefined when
   * genuinely unknown (never a placeholder or fabricated name). On the live card specifically,
   * undefined renders "In progress" instead of nothing, so an in-progress season never reads as
   * silently missing data the way a historical gap would. */
  leaderName?: string;
  onHoverStart: (e: MouseEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>, year: number) => void;
  onHoverEnd: (year: number) => void;
}) {
  return (
    <motion.div layout variants={staggerItem} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
      <Link
        href={isLive ? "/season" : archiveSeasonHref(year)}
        onMouseEnter={(e) => onHoverStart(e, year)}
        onMouseLeave={() => onHoverEnd(year)}
        onFocus={(e) => onHoverStart(e, year)}
        onBlur={() => onHoverEnd(year)}
        className="flex h-20 flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 px-3 text-center transition hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
      >
        <span className="flex items-center gap-1.5 font-semibold text-white">
          {year}
          {isLive && <span className="pulse-ring h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" aria-label="Live" />}
        </span>
        {typeof raceCount === "number" && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            {raceCount} race{raceCount === 1 ? "" : "s"}
          </span>
        )}
        {(leaderName || isLive) && <span className="w-full truncate text-[10px] text-neutral-400">{leaderName ?? "In progress"}</span>}
      </Link>
    </motion.div>
  );
}
