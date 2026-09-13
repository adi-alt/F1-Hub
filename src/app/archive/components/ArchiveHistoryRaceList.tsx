"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { raceHref } from "@/lib/routes";

export type HistoryRaceRow = { id: string; year: number; round: number; raceName: string; secondaryLabel: string; secondaryValue: string | null };

/** The shared row shape ArchiveCircuitHistory/ArchiveDriverHistory/ArchiveTeamHistory (page.tsx)
 * all render - previously three byte-for-byte-identical blocks differing only in what the
 * right-hand label/value pair meant (winner, or this driver's own finishing position). Client
 * component (not the server page itself, which can't use framer-motion directly) so it can match
 * ArchiveRaceList.tsx's own stagger-in treatment instead of these three lists being the one place
 * in Archive with zero motion at all. whileInView (not initial/animate) since these sit on normal
 * long-scrolling detail pages, not the fixed-height explorer - `once: true` so scrolling back up
 * and down again doesn't replay it. */
export function ArchiveHistoryRaceList({ races, className = "mt-6 space-y-2" }: { races: HistoryRaceRow[]; className?: string }) {
  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} variants={staggerContainer} className={className}>
      {races.map((r) => (
        <motion.div key={r.id} variants={staggerItem}>
          <Link
            href={raceHref(r.year, r.round, r.raceName)}
            className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
          >
            <div>
              <p className="text-xs text-neutral-500">{r.year}</p>
              <p className="font-semibold text-white">{r.raceName}</p>
            </div>
            {r.secondaryValue && (
              <div className="text-right">
                <p className="text-xs text-neutral-500">{r.secondaryLabel}</p>
                <p className="text-sm font-medium text-white">{r.secondaryValue}</p>
              </div>
            )}
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
