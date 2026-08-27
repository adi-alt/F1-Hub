"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/motion/variants";
import { archiveSeasonHref } from "@/lib/routes";
import type { ArchiveYearStats } from "@/lib/supabase/archive";

/** One season, as a meaningful selectable object instead of a bare year badge - race count and
 * "most wins" driver when the archive has stats for this year (a season pipeline hasn't reached
 * yet just renders the bare year, same graceful-gap convention every other archive view already
 * uses). Deliberately not "champion" - see getArchiveYearStats' own docstring for why that can't
 * be safely derived from the current data for every season. */
export function SeasonCard({ year, stats }: { year: number; stats?: ArchiveYearStats }) {
  return (
    <motion.div variants={staggerItem} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
      <Link
        href={archiveSeasonHref(year)}
        className="block rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-4 py-3 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
      >
        <p className="text-lg font-semibold text-white">{year}</p>
        {stats && (
          <div className="mt-1 space-y-0.5 text-xs text-neutral-500">
            <p>
              {stats.raceCount} race{stats.raceCount === 1 ? "" : "s"}
            </p>
            {stats.mostWinsDriver && (
              <p className="truncate" title={`${stats.mostWinsDriver.name}: ${stats.mostWinsDriver.wins} wins`}>
                Most wins: {stats.mostWinsDriver.name} ({stats.mostWinsDriver.wins})
              </p>
            )}
          </div>
        )}
      </Link>
    </motion.div>
  );
}
