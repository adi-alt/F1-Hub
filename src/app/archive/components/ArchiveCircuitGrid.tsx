"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { archiveCircuitHref } from "@/lib/routes";
import { Skeleton } from "@/components/ui/Skeleton";
import { FavoriteButton } from "./FavoriteButton";
import { StatusBadge } from "./StatusBadge";
import type { ArchiveCircuit } from "@/lib/supabase/archive";

/** Three real states, not the previous two: a `c.imageUrl` that exists still has to actually
 * finish downloading/decoding before there's anything to show, and until now that gap rendered
 * nothing at all over the gradient placeholder - the photo just popped in whenever the browser
 * got to it, on every single card in the grid, with no loading affordance in between. `status`
 * tracks that third state explicitly: a pulsing Skeleton covers the tile until `onLoad` actually
 * fires, then fades out as the real image fades in (no layout shift either way - both are
 * absolutely positioned over the same `fill` box). `onError` still swaps to `"broken"` - a 404'd
 * re-host - which renders nothing over the gradient, same as no image ever existing, rather than a
 * broken-image glyph. */
function CircuitThumbnail({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "broken">("loading");
  if (status === "broken") return null;
  return (
    <>
      {status === "loading" && <Skeleton className="absolute inset-0 rounded-none" />}
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-contain p-3 transition-opacity duration-300 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("broken")}
      />
    </>
  );
}

export function ArchiveCircuitGrid({
  circuits,
  search,
  favoriteIds,
  onToggleFavorite,
  activeCircuitIds,
  status,
  country,
  favoritesOnly,
  onClearFilters,
}: {
  circuits: ArchiveCircuit[];
  search: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (circuitId: string) => void;
  /** Circuit ids that resolve to a track on the *current* season's calendar - derived via the
   * existing resolveCurrentCircuitToArchiveId reconciliation (see archive/page.tsx), not a new
   * fabricated flag. */
  activeCircuitIds: Set<string>;
  status: "all" | "active" | "historical";
  country: string;
  favoritesOnly: boolean;
  /** Resets search + status + country + favorites-only, offered in the "no matches" empty state -
   * the same reset TrackFilters' own "Clear filters" link already does, just also reachable from
   * the empty state itself rather than only the filter row above it. */
  onClearFilters?: () => void;
}) {
  if (circuits.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        No circuits backfilled yet. The circuit/weather enrichment pass is still working through
        the archive.
      </p>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = circuits.filter((c) => {
    if (q && !(c.name ?? c.circuitId).toLowerCase().includes(q)) return false;
    if (status === "active" && !activeCircuitIds.has(c.circuitId)) return false;
    if (status === "historical" && activeCircuitIds.has(c.circuitId)) return false;
    if (country && c.country !== country) return false;
    if (favoritesOnly && !favoriteIds.has(c.circuitId)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        {favoritesOnly ? "You haven't favorited any tracks yet." : `No circuits found${search ? ` for "${search}"` : ""}.`}
        {onClearFilters && (
          <>
            {" "}
            <button type="button" onClick={onClearFilters} className="text-neutral-300 underline-offset-2 transition hover:text-white hover:underline">
              Clear filters
            </button>
          </>
        )}
      </p>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
    >
      {filtered.map((c) => {
        const isActive = activeCircuitIds.has(c.circuitId);
        return (
          <motion.div layout key={c.circuitId} variants={staggerItem} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Link
              href={archiveCircuitHref(c.circuitId)}
              // bg-[var(--f1-carbon)]/60, not the flat opaque fill this had before - the same
              // translucent zinc surface ArchiveTable's own wrapper uses, so "by track" reads as
              // the same visual family as "by year" (SeasonCard) and the tables, not a flatter,
              // heavier block sitting next to them.
              className="block overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 transition hover:border-white/30 hover:shadow-xl hover:shadow-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
            >
              <div className="relative h-32 w-full bg-gradient-to-b from-white/[0.09] to-white/[0.02]">
                {c.imageUrl && <CircuitThumbnail src={c.imageUrl} alt={`${c.name ?? c.circuitId} layout`} />}
                <FavoriteButton
                  favorited={favoriteIds.has(c.circuitId)}
                  onToggle={() => onToggleFavorite(c.circuitId)}
                  className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 backdrop-blur-sm hover:bg-black/60"
                />
              </div>
              <div className="px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold text-white" title={c.name ?? c.circuitId}>
                    {c.name ?? c.circuitId}
                  </p>
                  <StatusBadge active={isActive} />
                </div>
                <p className="mt-1 truncate text-xs text-neutral-500" title={c.country ?? undefined}>
                  {c.country ?? "Country unknown"}
                  {!!c.raceCount && ` · ${c.raceCount} race${c.raceCount === 1 ? "" : "s"}`}
                </p>
                {!!c.firstYear && (
                  <p className="text-xs text-neutral-500">{c.firstYear === c.lastYear ? c.firstYear : `${c.firstYear}–${c.lastYear}`}</p>
                )}
              </div>
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
