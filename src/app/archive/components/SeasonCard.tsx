"use client";

import type { FocusEvent, MouseEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/motion/variants";
import { archiveSeasonHref } from "@/lib/routes";

/** One season, as a compact selectable badge - deliberately almost nothing on the card itself
 * (just the year, plus a very subtle race-count line where that's known): the interesting
 * historical information (champion/leader) belongs in the hover tooltip ArchiveSeasonGrid owns,
 * not crammed onto ~76 cards at once as a mini dashboard. Fixed height (h-16), not auto-sized to
 * whether the race-count line renders - `flex-col justify-center` already centers either one line
 * (the live/in-progress card, which has no race count yet) or two, so every card is the same
 * geometry regardless of year/race-count/live-state rather than the live card reading as visibly
 * shorter. `isLive` is the one exception: the in-progress season gets a small pulsing dot and
 * links to /season instead of /archive?year=, since the archive has no data for it yet - same
 * size and treatment as every other card, not a separate hero. Translucent zinc (border +
 * bg-[var(--f1-carbon)]/60), not `.glass-surface` - with ~76 of these on screen at once, a real
 * backdrop-blur per card is real, unnecessary compositing cost, and this is also the same flat
 * translucent surface ArchiveTable and the "by track" grid both use, so every browse surface in
 * Archive reads as one consistent family instead of the cards looking heavier/glassier than
 * everything around them. onHoverStart/onHoverEnd wire the champion/leader
 * tooltip (mouse *and* focus/blur, same pattern SeasonCalendar's DayCell already uses, so keyboard
 * users get it too) - this card itself renders nothing else about that data, and deliberately no
 * driver photo/team logo (see ArchiveSeasonGrid's own comment on why). */
export function SeasonCard({
  year,
  isLive = false,
  raceCount,
  onHoverStart,
  onHoverEnd,
}: {
  year: number;
  isLive?: boolean;
  raceCount?: number;
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
        className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 px-4 text-center transition hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
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
      </Link>
    </motion.div>
  );
}
