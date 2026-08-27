"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { useRowFitPageSize } from "@/hooks/useRowFitPageSize";
import { useUrlPage } from "@/hooks/useUrlPage";
import { useUrlParam } from "@/hooks/useUrlParam";
import { FavoriteButton } from "./FavoriteButton";
import { Pagination } from "./Pagination";

// The exact same sticky-header treatment ChampionshipStandings.tsx uses (Season's own reference
// table), not a re-derived version - real opacity behind the blur so rows scrolling underneath
// don't bleed through, same translucent-dark token every sticky/floating surface in the app uses.
const HEADER_CLASS = "text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md border-b border-white/[0.08]";
const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };

export type ArchiveTableColumn<T> = {
  key: string;
  label: string;
  align?: "right" | "center";
  sortable?: boolean;
  /** Only meaningful when sortable - which direction a fresh click on this column starts at
   * ("asc" for names, "desc" for anything numeric where "most" is the interesting end). */
  defaultDir?: "asc" | "desc";
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  widthClassName?: string;
};

/** The shared table both ArchiveDriverTable and ArchiveTeamTable are now thin wrappers around -
 * they were previously two byte-for-byte-identical implementations differing only in field names.
 * Owns search/sort/pagination (URL-backed via useUrlPage/useUrlParam, so a refresh or a shared
 * link preserves them), the same dynamic row-fit page sizing (useRowFitPageSize) the original
 * tables used, and favoriting. Wrapped in overflow-x-auto scrollbar-hide with a min-w on the table
 * itself - the one real gap the original tables had: zero responsive handling at all, so a table
 * this wide simply couldn't be reached on a narrow viewport before. */
export function ArchiveTable<T>({
  rows,
  columns,
  getId,
  getSearchText,
  search,
  defaultSortKey,
  favoriteIds,
  onToggleFavorite,
  favoritesOnly = false,
  itemLabel,
  emptyMessage,
}: {
  rows: T[];
  columns: ArchiveTableColumn<T>[];
  getId: (row: T) => string;
  getSearchText: (row: T) => string;
  search: string;
  defaultSortKey: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  favoritesOnly?: boolean;
  itemLabel: string;
  emptyMessage: string;
}) {
  const [page, setPage] = useUrlPage();
  const defaultCol = columns.find((c) => c.key === defaultSortKey);
  const [sortParam, setSortParam] = useUrlParam("sort", `${defaultSortKey}:${defaultCol?.defaultDir ?? "desc"}`);
  const [rawKey, rawDir] = sortParam.split(":");
  const sortKey = columns.some((c) => c.key === rawKey && c.sortable) ? rawKey : defaultSortKey;
  const sortDir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";
  const sortColumn = columns.find((c) => c.key === sortKey);

  const rootRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const firstRowRef = useRef<HTMLTableRowElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const pageSize = useRowFitPageSize(rootRef, theadRef, firstRowRef, footerRef);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !getSearchText(r).toLowerCase().includes(q)) return false;
      if (favoritesOnly && !favoriteIds.has(getId(r))) return false;
      return true;
    });
    const list = [...filtered];
    const sortValue = sortColumn?.sortValue;
    if (sortValue) {
      list.sort((a, b) => {
        const av = sortValue(a);
        const bv = sortValue(b);
        const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : (av as number) - (bv as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, search, sortColumn, sortDir, getSearchText, favoritesOnly, favoriteIds, getId]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * pageSize;
  const pageItems = sorted.slice(pageStart, pageStart + pageSize);

  function toggleSort(key: string) {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortable) return;
    setSortParam(key === sortKey ? `${key}:${sortDir === "asc" ? "desc" : "asc"}` : `${key}:${col.defaultDir ?? "desc"}`);
    setPage(1);
  }

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">{emptyMessage}</p>;
  }
  if (sorted.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        {favoritesOnly && !search
          ? `You haven't favorited any ${itemLabel}s yet.`
          : `No ${itemLabel}s match “${search}”.`}
      </p>
    );
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="scrollbar-hide overflow-x-auto rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead ref={theadRef} className={`sticky top-0 z-10 ${HEADER_CLASS}`} style={HEADER_STYLE}>
            <tr>
              <th scope="col" className="w-12 px-4 py-2.5">
                S.No
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? (col.key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none") : undefined}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  className={`px-4 py-2.5 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""} ${
                    col.sortable ? "cursor-pointer select-none" : ""
                  } ${col.widthClassName ?? ""}`}
                >
                  {col.label}
                  {col.sortable && col.key === sortKey && <span className="ml-1 text-[var(--f1-red)]">{sortDir === "asc" ? "↑" : "↓"}</span>}
                </th>
              ))}
              <th scope="col" className="w-12 px-4 py-2.5 text-center">
                Favorite
              </th>
            </tr>
          </thead>
          <motion.tbody
            key={`${pageSafe}-${search}-${sortKey}-${sortDir}`}
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="divide-y divide-[var(--f1-line)]"
          >
            {pageItems.map((row, i) => {
              const id = getId(row);
              return (
                <motion.tr key={id} ref={i === 0 ? firstRowRef : undefined} variants={staggerItem}>
                  <td className="px-4 py-2.5 text-neutral-500">{pageStart + i + 1}</td>
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-2.5 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}`}>
                      {col.render(row)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-center">
                    <FavoriteButton favorited={favoriteIds.has(id)} onToggle={() => onToggleFavorite(id)} className="mx-auto" />
                  </td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>
      <div ref={footerRef}>
        <Pagination page={pageSafe} totalPages={totalPages} totalItems={sorted.length} itemLabel={itemLabel} onPageChange={setPage} />
      </div>
    </div>
  );
}
