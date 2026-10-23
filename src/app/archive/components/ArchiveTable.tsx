"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useUrlPage } from "@/hooks/useUrlPage";
import { useUrlParam } from "@/hooks/useUrlParam";
import { useFitRows } from "@/hooks/useFitRows";
import { FavoriteButton } from "./FavoriteButton";
import { Pagination } from "./Pagination";

/** A row's height as rendered (a 28px face, 2 x 10px padding, line box and divider), and what surrounds the rows inside the
 * screen: the header row, the pagination under the table, and the page's bottom margin. Rows per page is however
 * many fit between the two (useFitRows), so the list fills the screen and pages instead of scrolling. */
const ROW_HEIGHT = 45;
const TABLE_CHROME = 37 + 64 + 24;
/** A Tailwind w-N class as a CSS length (N/4 rem), for ui/Table's column width. */
function widthOf(className: string | undefined): string | undefined {
  const n = className?.match(/^w-(\d+)$/)?.[1];
  return n ? `${Number(n) / 4}rem` : undefined;
}

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
  /** A real width (e.g. "w-24") - the table is `table-fixed`, so a column's width no longer
   * depends on the current page/search's specific content (was the actual cause of columns
   * visibly jumping between pages). Leave unset on exactly one column (conventionally the name/
   * identity column) so it absorbs whatever width the others don't claim. */
  widthClassName?: string;
  /** Hidden below lg - for secondary columns (a driver's constructors, a team's drivers) that
   * aren't essential to a narrow-viewport read. Was `sm` (640px) - too eager: that wide a column
   * turning on well before there's actually room for it alongside name/races/years/status was
   * forcing the whole table wider than its container at ordinary desktop/laptop widths, not just
   * genuinely narrow ones. `lg` only turns it on once there's real room; overflow-x-auto below
   * stays the fallback for anything narrower still. */
  hideOnMobile?: boolean;
};

/** The shared table both ArchiveDriverTable and ArchiveTeamTable are now thin wrappers around -
 * they were previously two byte-for-byte-identical implementations differing only in field names.
 * Owns search/sort/pagination (URL-backed via useUrlPage/useUrlParam, so a refresh or a shared
 * link preserves them), as many rows per page as fit the screen (useFitRows), and favoriting. Wrapped in overflow-x-auto scrollbar-hide - the one real gap the
 * original tables had: zero responsive handling at all, so a table this wide simply couldn't be
 * reached on a narrow viewport before. */
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
  onClearFilters,
  rowHref,
}: {
  /** The page a row opens: the whole row is the target, not just its name (clicks on the row's own buttons and links
   * - the favourite toggle - still do their own thing). */
  rowHref?: (row: T) => string;
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
  /** Resets search + favorites-only, offered as a button in the "no matches" empty state. */
  onClearFilters?: () => void;
}) {
  const router = useRouter();
  const [page, setPage] = useUrlPage();
  const defaultCol = columns.find((c) => c.key === defaultSortKey);
  const [sortParam, setSortParam] = useUrlParam("sort", `${defaultSortKey}:${defaultCol?.defaultDir ?? "desc"}`);
  const [rawKey, rawDir] = sortParam.split(":");
  const sortKey = columns.some((c) => c.key === rawKey && c.sortable) ? rawKey : defaultSortKey;
  const sortDir: "asc" | "desc" = rawDir === "asc" ? "asc" : "desc";
  const sortColumn = columns.find((c) => c.key === sortKey);

  const tableRef = useRef<HTMLDivElement>(null);
  const pageSize = useFitRows(tableRef, { rowHeight: ROW_HEIGHT, chrome: TABLE_CHROME });

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

  if (rows.length === 0) {
    return <p className="text-sm text-tertiary">{emptyMessage}</p>;
  }
  if (sorted.length === 0) {
    return (
      <p className="text-sm text-tertiary">
        {favoritesOnly && !search ? `You haven't favorited any ${itemLabel}s yet.` : `No ${itemLabel}s match “${search}”.`}
        {onClearFilters && (
          <>
            {" "}
            <button type="button" onClick={onClearFilters} className="text-secondary underline-offset-2 transition hover:text-primary hover:underline">
              Clear search
            </button>
          </>
        )}
      </p>
    );
  }

  type Item = { row: T; index: number };
  const tableColumns: TableColumn<Item>[] = [
    { key: "index", header: "#", numeric: true, width: "3rem", render: (item) => <span className="text-tertiary">{item.index}</span> },
    ...columns.map(
      (col): TableColumn<Item> => ({
        key: col.key,
        header: col.label,
        align: col.align === "right" ? "end" : "start",
        sortable: col.sortable,
        firstSortDirection: col.defaultDir === "asc" ? "ascending" : "descending",
        sortValue: col.sortValue ? (item) => col.sortValue!(item.row) : undefined,
        width: widthOf(col.widthClassName),
        hideBelow: col.hideOnMobile ? "md" : undefined,
        render: (item) => col.render(item.row),
      }),
    ),
    {
      key: "favorite",
      header: "Fav",
      width: "4rem",
      render: (item) => {
        const id = getId(item.row);
        return <FavoriteButton favorited={favoriteIds.has(id)} onToggle={() => onToggleFavorite(id)} />;
      },
    },
  ];

  return (
    <div className="flex flex-col">
      <div ref={tableRef}>
        <Table
          columns={tableColumns}
          rows={pageItems.map((row, i) => ({ row, index: pageStart + i + 1 }))}
          getRowKey={(item) => getId(item.row)}
          caption={`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)}s`}
          rowHeader={columns[0]?.key}
          sort={{ key: sortKey, direction: sortDir === "asc" ? "ascending" : "descending" }}
          onSortChange={(next) => {
            setSortParam(`${next.key}:${next.direction === "ascending" ? "asc" : "desc"}`);
            setPage(1);
          }}
          onRowActivate={rowHref ? (item) => router.push(rowHref(item.row)) : undefined}
        />
      </div>
      <div>
        <Pagination page={pageSafe} totalPages={totalPages} totalItems={sorted.length} itemLabel={itemLabel} onPageChange={setPage} />
      </div>
    </div>
  );
}
