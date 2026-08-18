"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FavoriteButton } from "@/app/archive/components/FavoriteButton";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { useRowFitPageSize } from "@/hooks/useRowFitPageSize";

export type FavoriteEntity = {
  id: string;
  name: string;
  firstYear: number;
  lastYear: number;
  raceCount: number;
  extra: string;
  href: string;
};
type FavoriteType = "driver" | "team" | "track";

/** One favorites list per entity type (drivers/teams/tracks) — same list whether an entry got
 * favorited here, from the archive's own heart icons, or picked at signup: there's exactly one
 * favoriteDrivers/Teams/Tracks array per user, and this reads/writes it directly via
 * /api/archive/favorites, the same route the archive page uses. No separate "marked as favorite"
 * copy anywhere.
 *
 * `items` spans the full archive (1950-last year) plus the current season, merged in by the
 * page — so a fan of a retired driver or a long-gone team, and a fan of this year's rookie, can
 * both find and favorite who they're after. Favorited entries always sort to the top; everything
 * else follows most-recent-first.
 *
 * Page size isn't fixed - it's however many whole rows actually fit the available height,
 * measured from the real rendered thead/row/footer heights via ResizeObserver. The outer `root`
 * element is the one stretched to fill the available space (h-full, measured for that fit
 * calculation); the visible bordered table and the footer inside it are sized to their own
 * content, not stretched, so any leftover space becomes plain empty room below the footer
 * instead of a gap inside the table's own border — and there's no internal scrollbar, since the
 * row count was chosen specifically so the content fits. */
export function FavoriteEntityList({
  type,
  nameLabel,
  extraLabel,
  items,
  favoriteIds,
  search,
}: {
  type: FavoriteType;
  nameLabel: string;
  extraLabel: string;
  items: FavoriteEntity[];
  favoriteIds: string[];
  search: string;
}) {
  const [favorites, setFavorites] = useState(() => new Set(favoriteIds));
  const [page, setPage] = useState(1);

  const rootRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const firstRowRef = useRef<HTMLTableRowElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const pageSize = useRowFitPageSize(rootRef, theadRef, firstRowRef, footerRef);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    const list = [...filtered];
    list.sort((a, b) => {
      const af = favorites.has(a.id);
      const bf = favorites.has(b.id);
      if (af !== bf) return af ? -1 : 1;
      return b.lastYear - a.lastYear;
    });
    return list;
  }, [items, favorites, search]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * pageSize;
  const pageItems = sorted.slice(pageStart, pageStart + pageSize);

  function toggleFavorite(id: string) {
    const willFavorite = !favorites.has(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (willFavorite) next.add(id);
      else next.delete(id);
      return next;
    });
    fetch("/api/archive/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, favorited: willFavorite }),
    }).catch(() => {
      setFavorites((prev) => {
        const reverted = new Set(prev);
        if (willFavorite) reverted.delete(id);
        else reverted.add(id);
        return reverted;
      });
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">Nothing indexed yet, check back once the archive catches up.</p>;
  }
  if (sorted.length === 0) {
    return <p className="text-sm text-neutral-500">No matches for &ldquo;{search}&rdquo;.</p>;
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <table className="w-full text-left text-sm">
          <thead
            ref={theadRef}
            className="border-b border-[var(--f1-line)] bg-[var(--f1-carbon)] text-xs uppercase tracking-wide text-neutral-500"
          >
            <tr>
              <th className="w-12 px-4 py-2.5">S.No</th>
              <th className="px-4 py-2.5">{nameLabel}</th>
              <th className="px-4 py-2.5 text-right">Races</th>
              <th className="px-4 py-2.5 text-right">Years</th>
              <th className="px-4 py-2.5">{extraLabel}</th>
              <th className="w-12 px-4 py-2.5 text-center">Favorite</th>
            </tr>
          </thead>
          <motion.tbody
            key={`${type}-${pageSafe}-${search}`}
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="divide-y divide-[var(--f1-line)]"
          >
            {pageItems.map((item, i) => (
              <motion.tr key={item.id} ref={i === 0 ? firstRowRef : undefined} variants={staggerItem}>
                <td className="px-4 py-2.5 text-neutral-500">{pageStart + i + 1}</td>
                <td className="px-4 py-2.5">
                  <Link href={item.href} className="truncate font-medium text-white hover:text-[var(--f1-red)]">
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-400">{item.raceCount}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-neutral-400">
                  {item.firstYear === item.lastYear ? item.firstYear || "N/A" : `${item.firstYear}–${item.lastYear}`}
                </td>
                <td className="max-w-xs truncate px-4 py-2.5 text-neutral-500" title={item.extra}>
                  {item.extra || "N/A"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <FavoriteButton favorited={favorites.has(item.id)} onToggle={() => toggleFavorite(item.id)} className="mx-auto" />
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>

      <div ref={footerRef} className="mt-3 flex shrink-0 items-center justify-between text-sm text-neutral-500">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={pageSafe === 1}
          className="rounded-full border border-[var(--f1-line)] px-3 py-1 transition hover:border-white/30 hover:text-white disabled:opacity-40 disabled:hover:border-[var(--f1-line)] disabled:hover:text-neutral-500"
        >
          ← Prev
        </button>
        <span>
          Page {pageSafe} of {totalPages}, {sorted.length} total
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={pageSafe === totalPages}
          className="rounded-full border border-[var(--f1-line)] px-3 py-1 transition hover:border-white/30 hover:text-white disabled:opacity-40 disabled:hover:border-[var(--f1-line)] disabled:hover:text-neutral-500"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
