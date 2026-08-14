"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { archiveCircuitHref } from "@/lib/routes";
import { FavoriteButton } from "./FavoriteButton";
import type { ArchiveCircuit } from "@/lib/firestore/archive";

export function ArchiveCircuitGrid({
  circuits,
  search,
  favoriteIds,
  onToggleFavorite,
}: {
  circuits: ArchiveCircuit[];
  search: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (circuitId: string) => void;
}) {
  if (circuits.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        No circuits backfilled yet — the circuit/weather enrichment pass is still working through
        the archive.
      </p>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q ? circuits.filter((c) => (c.name ?? c.circuitId).toLowerCase().includes(q)) : circuits;
  if (filtered.length === 0) {
    return <p className="mt-8 text-sm text-neutral-500">No tracks match &ldquo;{search}&rdquo;.</p>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
    >
      {filtered.map((c) => (
        <motion.div key={c.circuitId} variants={staggerItem} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
          <Link
            href={archiveCircuitHref(c.circuitId)}
            className="block overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] transition hover:border-white/30 hover:shadow-xl hover:shadow-black/40"
          >
            <div className="relative h-32 w-full bg-gradient-to-b from-white/[0.09] to-white/[0.02]">
              {c.imageUrl && <Image src={c.imageUrl} alt="" fill unoptimized className="object-contain p-3" />}
              <FavoriteButton
                favorited={favoriteIds.has(c.circuitId)}
                onToggle={() => onToggleFavorite(c.circuitId)}
                className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 backdrop-blur-sm hover:bg-black/60"
              />
            </div>
            <div className="px-3.5 py-3">
              <p className="truncate font-semibold text-white">{c.name ?? c.circuitId}</p>
              <p className="mt-1 truncate text-xs text-neutral-500">
                {c.country ?? "Country unknown"}
                {!!c.raceCount && ` · ${c.raceCount} race${c.raceCount === 1 ? "" : "s"}`}
              </p>
              {!!c.firstYear && (
                <p className="text-xs text-neutral-500">
                  {c.firstYear === c.lastYear ? c.firstYear : `${c.firstYear}–${c.lastYear}`}
                </p>
              )}
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
