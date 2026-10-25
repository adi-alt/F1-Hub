"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { FavoriteButton } from "@/app/archive/components/FavoriteButton";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { useUrlPage } from "@/hooks/useUrlPage";
import { refreshOnce } from "@/lib/refreshGuard";
import { useFitRows } from "@/hooks/useFitRows";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { Pagination } from "@/app/archive/components/Pagination";

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
 * /api/archive/favorites, the same route the archive page uses. No separate "marked as favourite"
 * copy anywhere.
 *
 * `items` spans the full archive (1950-last year) plus the current season, merged in by the
 * page — so a fan of a retired driver or a long-gone team, and a fan of this year's rookie, can
 * both find and favorite who they're after. Favorited entries always sort to the top; everything
 * else follows most-recent-first.
 *
 * Drawn as the archive's lists are (the site's glass panel, eyebrow headers, the shared pagination), with as many
 * rows per page as fit the screen, so it pages instead of scrolling. */
const ROW_HEIGHT = 53;
const TABLE_CHROME = 41 + 64 + 24;

const ITEM_LABEL: Record<FavoriteType, string> = { driver: "driver", team: "team", track: "circuit" };

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
  const [page, setPage] = useUrlPage();
  const router = useRouter();

  const tableRef = useRef<HTMLDivElement>(null);
  const pageSize = useFitRows(tableRef, { rowHeight: ROW_HEIGHT, chrome: TABLE_CHROME });

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
    })
      .then((res) => {
        // Homepage (Your F1/Season Recap/Apex/Ask Apex) reads favorites via a server-rendered
        // prop, not this component's own state - nothing tells it to look again without this.
        // Deduped against AppRealtimeSync's echo of this same write via refreshOnce (see there).
        if (res.ok) refreshOnce(router);
        else throw new Error(`HTTP ${res.status}`);
      })
      .catch(() => {
        setFavorites((prev) => {
          const reverted = new Set(prev);
          if (willFavorite) reverted.delete(id);
          else reverted.add(id);
          return reverted;
        });
      });
  }

  if (items.length === 0) {
    return <p className="text-body-sm text-tertiary">Nothing to show yet.</p>;
  }
  if (sorted.length === 0) {
    return <p className="text-body-sm text-tertiary">No matches for &ldquo;{search}&rdquo;.</p>;
  }

  return (
    <div className="flex flex-col">
      <div ref={tableRef} className={`scrollbar-hide overflow-x-auto ${PANEL}`}>
        <table className="w-full text-left text-body-sm">
          <thead className={`border-b border-white/[0.06] ${EYEBROW}`}>
            <tr>
              <th scope="col" className="w-12 px-4 py-3">#</th>
              <th scope="col" className="px-4 py-3">{nameLabel}</th>
              <th scope="col" className="px-4 py-3 text-right">Races</th>
              <th scope="col" className="px-4 py-3 text-right">Years</th>
              <th scope="col" className="hidden px-4 py-3 md:table-cell">{extraLabel}</th>
              <th scope="col" className="w-16 px-4 py-3 text-center">
                <span className="sr-only">Favourite</span>
              </th>
            </tr>
          </thead>
          <motion.tbody key={`${type}-${pageSafe}-${search}`} initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-white/[0.05]">
            {pageItems.map((item, i) => (
              <motion.tr key={item.id} variants={staggerItem} className="transition-colors duration-fast hover:bg-white/[0.025]">
                <td className="px-4 py-2.5 font-mono text-caption tabular text-tertiary">{pageStart + i + 1}</td>
                <td className="max-w-0 px-4 py-2.5">
                  <Link href={item.href} className="block truncate font-medium text-primary underline-offset-4 hover:underline">
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right tabular text-secondary">{item.raceCount}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular text-secondary">
                  {item.firstYear === item.lastYear ? item.firstYear || "–" : `${item.firstYear}–${item.lastYear}`}
                </td>
                <td className="hidden max-w-xs truncate px-4 py-2.5 text-tertiary md:table-cell" title={item.extra}>
                  {item.extra || "–"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <FavoriteButton favorited={favorites.has(item.id)} onToggle={() => toggleFavorite(item.id)} className="mx-auto" />
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
      <Pagination page={pageSafe} totalPages={totalPages} totalItems={sorted.length} itemLabel={ITEM_LABEL[type]} onPageChange={setPage} />
    </div>
  );
}
