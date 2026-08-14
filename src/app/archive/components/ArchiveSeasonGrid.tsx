"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { archiveSeasonHref } from "@/lib/routes";

export function ArchiveSeasonGrid({ years }: { years: number[] }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6"
    >
      {years.map((year) => (
        <motion.div key={year} variants={staggerItem} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
          <Link
            href={archiveSeasonHref(year)}
            className="block rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-4 py-3 text-center font-semibold text-white transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
          >
            {year}
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
