"use client";

import { Fragment, useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";

export type SortDirection = "ascending" | "descending";
export type TableSort = { key: string; direction: SortDirection };
export type TableSortValue = string | number | boolean | Date | null | undefined;
export type TableRowKey = string | number;

/** A field of the row (autocompleted), or any other string for a computed column. */
type ColumnKey<Row> = (keyof Row & string) | (string & Record<never, never>);

export type TableColumn<Row> = {
  /** Identifies the column. When it names a row field, that field is the default cell and sort value. */
  key: ColumnKey<Row>;
  header: string;
  /** Defaults to "end" for numeric columns and "start" otherwise. */
  align?: "start" | "end";
  /** Tabular figures, aligned to the end; the first sort click puts the highest value first. */
  numeric?: boolean;
  sortable?: boolean;
  /** Overrides the first-click direction (descending for numeric columns, ascending otherwise). */
  firstSortDirection?: SortDirection;
  /** Preferred column width: a CSS length such as "8rem", or a number of pixels. */
  width?: string | number;
  render?: (row: Row) => ReactNode;
  /** What to sort by when it isn't the raw field, e.g. a status ranked by severity. */
  sortValue?: (row: Row) => TableSortValue;
};

export type TableProps<Row extends object> = {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => TableRowKey;
  /** Names the table for assistive tech (a visually hidden caption), and makes the scroll area a
   * named, focusable region so it can be scrolled from the keyboard even with nothing focusable in it. */
  caption?: string;
  density?: "compact" | "default";
  /** Freezes the first column below the md breakpoint, while the table scrolls sideways. */
  stickyFirstColumn?: boolean;
  /** The column whose cells head their rows (th scope="row") and name each row's disclosure button.
   * Defaults to the first column. */
  rowHeader?: ColumnKey<Row>;
  /** Controlled sort (null for unsorted). Leave undefined and the table keeps its own, from defaultSort. */
  sort?: TableSort | null;
  defaultSort?: TableSort | null;
  onSortChange?: (sort: TableSort) => void;
  /** Makes each row focusable and activatable by click, Enter or Space. Clicks on a control inside
   * the row (a link, a button) are left to that control. */
  onRowActivate?: (row: Row) => void;
  /** Gives every row (true), or the rows it returns true for, a disclosure button that shows
   * renderExpanded(row) in a row of its own. Needs renderExpanded. */
  expandable?: boolean | ((row: Row) => boolean);
  renderExpanded?: (row: Row) => ReactNode;
  /** Controlled expanded rows. Leave undefined and the table keeps its own. */
  expandedKeys?: readonly TableRowKey[];
  onExpandedChange?: (keys: TableRowKey[]) => void;
  /** Shown in one full-width row when there are no rows. */
  empty?: ReactNode;
  /** Layout only: margin, width, grid placement. */
  className?: string;
};

/** The next sort after a click on `columnKey`'s header: the same column flips direction, a new one
 * starts at `firstDirection`. */
export function nextSort(current: TableSort | null, columnKey: string, firstDirection: SortDirection = "ascending"): TableSort {
  if (current?.key === columnKey) return { key: columnKey, direction: current.direction === "ascending" ? "descending" : "ascending" };
  return { key: columnKey, direction: firstDirection };
}

// One fixed locale, so the server and the browser put rows in the same order (no hydration
// mismatch); numeric collation puts "Car 2" before "Car 10".
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** A sortable form of a cell value, or null for an empty or unsortable one. */
function sortKeyOf(value: unknown): string | number | null {
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "string") return value === "" ? null : value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  return null;
}

/** Orders two rows by one column. Empty values (null, undefined, "", NaN) go last in both directions,
 * so a sort never leads with blanks. */
export function compareRows<Row extends object>(a: Row, b: Row, column: TableColumn<Row>, direction: SortDirection): number {
  const x = sortKeyOf(column.sortValue ? column.sortValue(a) : Reflect.get(a, column.key));
  const y = sortKeyOf(column.sortValue ? column.sortValue(b) : Reflect.get(b, column.key));
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  const order = typeof x === "number" && typeof y === "number" ? (x < y ? -1 : x > y ? 1 : 0) : collator.compare(String(x), String(y));
  return direction === "ascending" ? order : -order;
}

/** The rows in `sort` order (a stable sort, so ties keep the order they were given in). Unchanged
 * when there's no sort or it names a column that isn't sortable. */
export function sortRows<Row extends object>(rows: readonly Row[], columns: readonly TableColumn<Row>[], sort: TableSort | null): readonly Row[] {
  const column = sort ? columns.find((c) => c.key === sort.key && c.sortable) : undefined;
  if (!sort || !column) return rows;
  return [...rows].sort((a, b) => compareRows(a, b, column, sort.direction));
}

export function isRowActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

const NESTED_CONTROL = "a, button, input, select, textarea, label, summary, [role='button'], [role='link'], [role='checkbox'], [role='switch'], [tabindex]";

/** Whether a click in an activatable row came from a control inside it (a link, the disclosure
 * button), which does its own thing instead of also activating the row. */
export function isFromNestedControl(target: EventTarget | null, row: Element): boolean {
  const control = target && "closest" in target ? (target as Element).closest(NESTED_CONTROL) : null;
  return control !== null && control !== row && row.contains(control);
}

function alignOf(column: { align?: "start" | "end"; numeric?: boolean }): "start" | "end" {
  return column.align ?? (column.numeric ? "end" : "start");
}

/** A row field shown as-is when the column has no render: text and numbers only. */
function fieldContent(row: object, key: string): ReactNode {
  const value: unknown = Reflect.get(row, key);
  return typeof value === "string" || typeof value === "number" ? value : null;
}

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";
const STICKY_CELL = "max-md:sticky max-md:left-0 max-md:z-sticky max-md:border-r max-md:bg-surface-1";
// An activatable row draws its focus ring inset: a ring outside the row would be clipped by the
// scroll container at both ends and under the last row.
const ACTIVATABLE_ROW =
  "group/row cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";
const ACTIVATABLE_STICKY_CELL = "max-md:group-hover/row:bg-surface-2 max-md:group-focus-visible/row:bg-surface-2";
const DISCLOSURE_BUTTON = `inline-flex size-7 items-center justify-center rounded-control text-secondary transition-colors duration-fast ease-standard motion-reduce:transition-none hover:bg-surface-2 hover:text-primary ${FOCUS_RING}`;

/** Every sortable header keeps the arrow's space, so its label doesn't shift when it becomes the
 * sorted column; the arrow itself shows only on the sorted column. */
function SortIcon({ direction }: { direction: SortDirection | undefined }) {
  return (
    <span aria-hidden className="inline-flex size-4 shrink-0">
      {direction === "ascending" && <ArrowUp size={16} strokeWidth={1.75} />}
      {direction === "descending" && <ArrowDown size={16} strokeWidth={1.75} />}
    </span>
  );
}

/**
 * The data table (spec §4.5). Headers are the one uppercase type tier; numeric columns are
 * end-aligned with tabular figures; rows are 36px (compact) or 44px with hairlines and no zebra
 * striping. It scrolls sideways in its own container, with the scrollbar left visible. Sorting
 * follows the APG sortable table: a button in each sortable header and aria-sort on its cell.
 * Expanded content rows stay in the DOM while collapsed (hidden), so aria-controls always resolves.
 */
export function Table<Row extends object>({
  columns,
  rows,
  getRowKey,
  caption,
  density = "default",
  stickyFirstColumn = false,
  rowHeader,
  sort,
  defaultSort = null,
  onSortChange,
  onRowActivate,
  expandable = false,
  renderExpanded,
  expandedKeys,
  onExpandedChange,
  empty,
  className = "",
}: TableProps<Row>) {
  const baseId = useId();
  const [ownSort, setOwnSort] = useState<TableSort | null>(defaultSort);
  const [ownExpanded, setOwnExpanded] = useState<readonly TableRowKey[]>([]);
  const activeSort = sort === undefined ? ownSort : sort;
  const expanded = expandedKeys ?? ownExpanded;
  const disclosure = Boolean(expandable && renderExpanded);
  const columnCount = columns.length + (disclosure ? 1 : 0);
  const rowHeaderKey = rowHeader ?? columns[0]?.key;
  const hasRowHeader = columns.some((column) => column.key === rowHeaderKey);
  const cellSize = density === "compact" ? "h-9 py-1" : "h-11 py-2";
  const visibleRows = sortRows(rows, columns, activeSort);

  function changeSort(column: TableColumn<Row>) {
    const next = nextSort(activeSort, column.key, column.firstSortDirection ?? (column.numeric ? "descending" : "ascending"));
    if (sort === undefined) setOwnSort(next);
    onSortChange?.(next);
  }

  function toggleExpanded(key: TableRowKey) {
    const next = expanded.includes(key) ? expanded.filter((k) => k !== key) : [...expanded, key];
    if (expandedKeys === undefined) setOwnExpanded(next);
    onExpandedChange?.(next);
  }

  return (
    <div
      role={caption ? "region" : undefined}
      aria-label={caption}
      tabIndex={caption ? 0 : undefined}
      className={`overflow-x-auto rounded-card bg-surface-1 ${caption ? FOCUS_RING : ""} ${className}`}
    >
      <table className="w-full border-separate border-spacing-0 text-body-sm text-primary">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column, index) => {
              const end = alignOf(column) === "end";
              const sorted = activeSort?.key === column.key ? activeSort.direction : undefined;
              return (
                <th
                  key={column.key}
                  scope="col"
                  // Only on the sorted column: ARIA says aria-sort SHOULD be on one header at a time, as
                  // in the APG sortable-table example; the other sortable headers are still buttons.
                  aria-sort={column.sortable ? sorted : undefined}
                  style={column.width === undefined ? undefined : { width: column.width }}
                  className={`h-9 whitespace-nowrap border-b border-subtle px-3 text-caption uppercase tracking-[0.04em] text-secondary ${end ? "text-end" : "text-start"} ${stickyFirstColumn && index === 0 ? STICKY_CELL : ""}`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => changeSort(column)}
                      className={`inline-flex min-h-6 items-center gap-1 rounded-control uppercase transition-colors duration-fast ease-standard motion-reduce:transition-none hover:text-primary ${FOCUS_RING} ${sorted ? "text-primary" : ""}`}
                    >
                      {/* End-aligned columns lead with the arrow, so the label lines up with the figures. */}
                      {end && <SortIcon direction={sorted} />}
                      {column.header}
                      {!end && <SortIcon direction={sorted} />}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {disclosure && (
              <th scope="col" className="h-9 w-px border-b border-subtle px-2">
                <span className="sr-only">Details</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 && empty !== undefined && (
            <tr>
              <td colSpan={columnCount} className="px-3 py-6 text-secondary">
                {empty}
              </td>
            </tr>
          )}
          {visibleRows.map((row) => {
            const key = getRowKey(row);
            const rowId = `${baseId}-row-${encodeURIComponent(String(key))}`;
            const canExpand = disclosure && (typeof expandable === "function" ? expandable(row) : true);
            const isExpanded = canExpand && expanded.includes(key);
            // An open row's hairline moves below its details, so the two read as one.
            const hairline = isExpanded ? "border-subtle" : "border-b border-subtle";
            return (
              <Fragment key={key}>
                <tr
                  tabIndex={onRowActivate ? 0 : undefined}
                  onClick={
                    onRowActivate
                      ? (event) => {
                          if (!isFromNestedControl(event.target, event.currentTarget)) onRowActivate(row);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowActivate
                      ? (event) => {
                          if (event.target !== event.currentTarget || !isRowActivationKey(event.key)) return;
                          event.preventDefault(); // Space would otherwise scroll the page
                          onRowActivate(row);
                        }
                      : undefined
                  }
                  className={onRowActivate ? ACTIVATABLE_ROW : undefined}
                >
                  {columns.map((column, index) => {
                    const sticky = stickyFirstColumn && index === 0 ? `${STICKY_CELL} ${onRowActivate ? ACTIVATABLE_STICKY_CELL : ""}` : "";
                    const cellClass = `${cellSize} ${hairline} whitespace-nowrap px-3 ${alignOf(column) === "end" ? "text-end" : "text-start"} ${column.numeric ? "tabular" : ""} ${sticky}`;
                    const content = column.render ? column.render(row) : fieldContent(row, column.key);
                    return column.key === rowHeaderKey ? (
                      <th key={column.key} scope="row" id={`${rowId}-header`} className={`${cellClass} font-medium`}>
                        {content}
                      </th>
                    ) : (
                      <td key={column.key} className={cellClass}>
                        {content}
                      </td>
                    );
                  })}
                  {disclosure && (
                    <td className={`${cellSize} ${hairline} w-px px-2 text-end`}>
                      {canExpand && (
                        <button
                          type="button"
                          id={`${rowId}-toggle`}
                          aria-expanded={isExpanded}
                          aria-controls={`${rowId}-details`}
                          // Its own "Details" plus the row header: "Details Max Verstappen".
                          aria-labelledby={hasRowHeader ? `${rowId}-toggle ${rowId}-header` : undefined}
                          onClick={() => toggleExpanded(key)}
                          className={DISCLOSURE_BUTTON}
                        >
                          <span className="sr-only">Details</span>
                          <ChevronDown
                            aria-hidden
                            size={16}
                            strokeWidth={1.75}
                            className={`transition-transform duration-fast ease-standard motion-reduce:transition-none ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {canExpand && (
                  <tr id={`${rowId}-details`} hidden={!isExpanded}>
                    <td colSpan={columnCount} className="border-b border-subtle px-3 pb-4 pt-1">
                      {isExpanded ? renderExpanded?.(row) : null}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
