"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { archiveCircuitHref } from "@/lib/routes";
import type { ArchiveCircuit } from "@/lib/firestore/archive";

export function ArchiveCircuitGrid({ circuits }: { circuits: ArchiveCircuit[] }) {
  if (circuits.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        No circuits backfilled yet — the circuit/weather enrichment pass is still working through
        the archive.
      </p>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
    >
      {circuits.map((c) => (
        <motion.div key={c.circuitId} variants={staggerItem} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
          <Link
            href={archiveCircuitHref(c.circuitId)}
            className="block overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
          >
            <div className="relative h-24 w-full bg-black/30">
              {c.imageUrl && <Image src={c.imageUrl} alt="" fill unoptimized className="object-contain p-2" />}
            </div>
            <p className="truncate px-3 py-2 text-center text-sm font-semibold text-white">{c.name ?? c.circuitId}</p>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
