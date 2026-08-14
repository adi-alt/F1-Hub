"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { archiveDriverHref } from "@/lib/routes";
import type { ArchiveDriver } from "@/lib/firestore/archive";

export function ArchiveDriverGrid({ drivers }: { drivers: ArchiveDriver[] }) {
  if (drivers.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        No drivers indexed yet — the driver-index pipeline pass hasn&apos;t run over this data yet.
      </p>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="mt-8 grid gap-2 sm:grid-cols-2">
      {drivers.map((d) => (
        <motion.div key={d.driverId} variants={staggerItem}>
          <Link
            href={archiveDriverHref(d.driverId)}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-4 py-3 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
          >
            <span className="truncate font-medium text-white">{d.name}</span>
            <span className="shrink-0 text-right text-xs text-neutral-500">
              <span className="block">
                {d.firstYear === d.lastYear ? d.firstYear : `${d.firstYear}–${d.lastYear}`}
              </span>
              <span className="block">
                {d.raceCount} race{d.raceCount === 1 ? "" : "s"}
              </span>
            </span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
