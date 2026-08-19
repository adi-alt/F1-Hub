"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { useRowFitPageSize } from "@/hooks/useRowFitPageSize";
import { useUrlPage } from "@/hooks/useUrlPage";
import { archiveDriverHref } from "@/lib/routes";
import { FavoriteButton } from "./FavoriteButton";
import type { ArchiveDriver } from "@/lib/supabase/archive";

type SortKey = "name" | "races";

/** Same table treatment as personalization's FavoriteEntityList: page size isn't fixed, it's
 * however many whole rows actually fit the available height (useRowFitPageSize), the visible
 * bordered table sizes to its own content rather than being stretched to fill, and there's no
 * internal scrollbar. `root`'s parent is expected to give it a bounded, flex-1 height to measure
 * against (see ArchiveExplorer). */
export function ArchiveDriverTable({
  drivers,
  search,
  favoriteIds,
  onToggleFavorite,
}: {
  drivers: ArchiveDriver[];
  search: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (driverId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("races");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useUrlPage();

  const rootRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const firstRowRef = useRef<HTMLTableRowElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const pageSize = useRowFitPageSize(rootRef, theadRef, firstRowRef, footerRef);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? drivers.filter((d) => d.name.toLowerCase().includes(q)) : drivers;
    const list = [...filtered];
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name) : a.raceCount - b.raceCount;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [drivers, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * pageSize;
  const pageItems = sorted.slice(pageStart, pageStart + pageSize);

  function toggleSort(key: SortKey) {
    setPage(1);
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return null;
    return <span className="ml-1 text-[var(--f1-red)]">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  if (drivers.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No drivers indexed yet, the driver-index pipeline pass hasn&apos;t run over this data yet.
      </p>
    );
  }
  if (sorted.length === 0) {
    return <p className="text-sm text-neutral-500">No drivers match &ldquo;{search}&rdquo;.</p>;
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
              <th className="cursor-pointer select-none px-4 py-2.5" onClick={() => toggleSort("name")}>
                Driver{sortIndicator("name")}
              </th>
              <th className="cursor-pointer select-none px-4 py-2.5 text-right" onClick={() => toggleSort("races")}>
                Races{sortIndicator("races")}
              </th>
              <th className="px-4 py-2.5 text-right">Years</th>
              <th className="px-4 py-2.5">Constructor(s)</th>
              <th className="w-12 px-4 py-2.5 text-center">Favorite</th>
            </tr>
          </thead>
          <motion.tbody
            key={`${pageSafe}-${search}-${sortKey}-${sortDir}`}
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="divide-y divide-[var(--f1-line)]"
          >
            {pageItems.map((d, i) => (
              <motion.tr key={d.driverId} ref={i === 0 ? firstRowRef : undefined} variants={staggerItem}>
                <td className="px-4 py-2.5 text-neutral-500">{pageStart + i + 1}</td>
                <td className="px-4 py-2.5">
                  <Link href={archiveDriverHref(d.driverId)} className="truncate font-medium text-white hover:text-[var(--f1-red)]">
                    {d.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-400">{d.raceCount}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-neutral-400">
                  {d.firstYear === d.lastYear ? d.firstYear : `${d.firstYear}–${d.lastYear}`}
                </td>
                <td className="max-w-xs truncate px-4 py-2.5 text-neutral-500" title={d.constructors?.join(", ")}>
                  {d.constructors?.length ? d.constructors.join(", ") : "N/A"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <FavoriteButton favorited={favoriteIds.has(d.driverId)} onToggle={() => onToggleFavorite(d.driverId)} className="mx-auto" />
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>

      <div ref={footerRef} className="mt-3 grid shrink-0 grid-cols-3 items-center text-sm text-neutral-500">
        <div>
          {pageSafe > 1 && (
            <button
              onClick={() => setPage(pageSafe - 1)}
              className="rounded-full border border-[var(--f1-line)] px-3 py-1 transition hover:border-white/30 hover:text-white"
            >
              ← Prev
            </button>
          )}
        </div>
        <span className="text-center">
          Page {pageSafe} of {totalPages}, {sorted.length} driver{sorted.length === 1 ? "" : "s"}
        </span>
        <div className="text-right">
          {pageSafe < totalPages && (
            <button
              onClick={() => setPage(pageSafe + 1)}
              className="rounded-full border border-[var(--f1-line)] px-3 py-1 transition hover:border-white/30 hover:text-white"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
