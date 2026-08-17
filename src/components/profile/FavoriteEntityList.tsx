"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FavoriteButton } from "@/app/archive/components/FavoriteButton";

export type FavoriteEntity = { id: string; name: string; lastYear: number; raceCount: number; href: string };
type FavoriteType = "driver" | "team" | "track";

const PAGE_SIZE = 25;

/** One favorites list per entity type (drivers/teams/tracks) — same list whether an entry got
 * favorited here, from the archive's own heart icons, or picked at signup: there's exactly one
 * favoriteDrivers/Teams/Tracks array per user, and this reads/writes it directly via
 * /api/archive/favorites, the same route the archive page uses. No separate "marked as favorite"
 * copy anywhere.
 *
 * `items` is the full history (current season through 1950, via the archive's own driver/team/
 * circuit index) — not just this year's grid — so a fan of a retired driver or a long-defunct
 * team can still find and favorite them. Favorited entries always sort to the top; everything
 * else follows most-recent-first. 25 per page, real pagination (no infinite scroll). */
export function FavoriteEntityList({
  type,
  items,
  favoriteIds,
}: {
  type: FavoriteType;
  items: FavoriteEntity[];
  favoriteIds: string[];
}) {
  const [favorites, setFavorites] = useState(() => new Set(favoriteIds));
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const list = [...items];
    list.sort((a, b) => {
      const af = favorites.has(a.id);
      const bf = favorites.has(b.id);
      if (af !== bf) return af ? -1 : 1;
      return b.lastYear - a.lastYear;
    });
    return list;
  }, [items, favorites]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

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
    return <p className="text-sm text-neutral-500">Nothing indexed yet — check back once the archive catches up.</p>;
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
        {/* Bounded height + its own scroll, not the page's — a 25-row page fits on screen as a
            fixed box, with the thead pinned via sticky rather than scrolling out of view. */}
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-[var(--f1-line)] bg-[var(--f1-carbon)] text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="w-10 px-4 py-2.5" aria-hidden />
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5 text-right">Years · Races</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--f1-line)]">
              {pageItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5">
                    <FavoriteButton favorited={favorites.has(item.id)} onToggle={() => toggleFavorite(item.id)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={item.href} className="truncate font-medium text-white hover:text-[var(--f1-red)]">
                      {item.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-neutral-500">
                    {item.lastYear || "—"} · {item.raceCount} race{item.raceCount === 1 ? "" : "s"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={pageSafe === 1}
          className="rounded-full border border-[var(--f1-line)] px-3 py-1 transition hover:border-white/30 hover:text-white disabled:opacity-40 disabled:hover:border-[var(--f1-line)] disabled:hover:text-neutral-500"
        >
          ← Prev
        </button>
        <span>
          Page {pageSafe} of {totalPages} · {sorted.length} total
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
