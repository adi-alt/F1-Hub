"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRichMotion } from "@/hooks/useRichMotion";
import { Crown } from "lucide-react";
import { archiveSeasonHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";

export type SeasonPoint = {
  year: number;
  points: number;
  wins: number;
  podiums: number;
  races: number;
  /** The team raced for that season (the most-raced one, for a mid-season move). */
  team: string;
  /** Champion that season - only ever true where the archive's points sum is the real title rule (1991 on). */
  champion: boolean;
};

/**
 * A career (or a team's history) told season by season: one bar per year, its height the season's points (Grand Prix
 * plus sprint), its colour the team that year, a crown on a title. The bars grow in one after another as the chart
 * comes into view, so the arc of the career reads like a story; hovering or focusing a season shows its line, and
 * every bar opens that season. Reduced motion: the bars are simply there.
 */
export function ArchiveSeasonStory({ seasons, subject }: { seasons: SeasonPoint[]; subject: string }) {
  // Bars grow in one after another on desktop; on a phone they are simply there (useRichMotion).
  const reduce = !useRichMotion();
  const sorted = [...seasons].sort((a, b) => a.year - b.year);
  const [active, setActive] = useState<number | null>(null);
  if (sorted.length === 0) return null;
  const max = Math.max(...sorted.map((s) => s.points), 1);
  const best = sorted.reduce((a, b) => (b.points > a.points ? b : a));
  const titles = sorted.filter((s) => s.champion);
  const shown = sorted.find((s) => s.year === active) ?? null;

  return (
    <div>
      {/* The headline first (audit §7): the answer, then the shape. */}
      <p className="text-body-sm text-secondary">
        {titles.length > 0 ? (
          <>
            {titles.length === 1 ? "Champion in " : `${titles.length} titles: `}
            <span className="font-semibold text-primary">{titles.map((t) => t.year).join(", ")}</span>.{" "}
          </>
        ) : null}
        Best season: <span className="font-semibold tabular text-primary">{best.year}</span>, {best.points} points
        {best.wins > 0 ? `, ${best.wins} win${best.wins === 1 ? "" : "s"}` : ""}.
      </p>

      <div className="mt-5 overflow-x-auto pb-1">
        <ol aria-label={`${subject}, points season by season`} className="flex h-40 min-w-full items-end border-b border-white/[0.06]" style={{ minWidth: `${sorted.length * 10}px` }}>
          {sorted.map((s, i) => {
            const h = Math.max(2, (s.points / max) * 100);
            const color = teamColor(s.team);
            return (
              <li key={s.year} className="relative flex h-full min-w-2 flex-1 flex-col justify-end">
                {s.champion && <Crown aria-hidden size={12} className="mx-auto mb-1 shrink-0 text-warning" />}
                <Link
                  href={archiveSeasonHref(s.year)}
                  aria-label={`${s.year}: ${s.points} points, ${s.wins} wins, ${s.team}${s.champion ? ", champion" : ""}`}
                  onMouseEnter={() => setActive(s.year)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(s.year)}
                  onBlur={() => setActive(null)}
                  className="mx-auto block w-3/5 min-w-1.5 rounded-t-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  style={{ height: `${h}%` }}
                >
                  <motion.span
                    className="block h-full w-full origin-bottom rounded-t-[2px]"
                    style={{ background: color, opacity: active === null ? 0.8 : active === s.year ? 1 : 0.3 }}
                    initial={reduce ? false : { scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : Math.min(i * 0.035, 1.2), ease: [0.2, 0, 0, 1] }}
                  />
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="mt-1.5 flex justify-between font-mono text-caption tabular text-tertiary" aria-hidden>
          <span>{sorted[0].year}</span>
          {sorted.length > 2 && <span>{sorted[Math.floor(sorted.length / 2)].year}</span>}
          <span>{sorted[sorted.length - 1].year}</span>
        </div>
      </div>

      <p className="mt-3 min-h-5 text-caption text-tertiary" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-primary">{shown.year}</span> · <span className="text-secondary">{shown.team}</span> · {shown.points} points · {shown.wins} win{shown.wins === 1 ? "" : "s"}, {shown.podiums} podium
            {shown.podiums === 1 ? "" : "s"} from {shown.races} race{shown.races === 1 ? "" : "s"}
            {shown.champion ? " · Champion" : ""}
          </>
        ) : (
          "Hover or tab to a season for its line; select it to open that season."
        )}
      </p>
    </div>
  );
}
