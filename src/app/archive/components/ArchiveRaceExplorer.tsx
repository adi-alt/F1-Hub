"use client";

import { useMemo, useState } from "react";
import { EntityAvatar } from "@/components/EntityAvatar";

export type ExplorerRow = {
  id: string;
  year: number;
  round: number;
  raceName: string;
  circuitName: string | null;
  country: string | null;
  /** Team name (driver explorer), driver name (team/circuit explorer) - whichever "who else was
   * involved" fact this row's own entity column shows. Null when genuinely unknown. */
  entityLabel: string | null;
  entityAvatarUrl?: string | null;
  /** Square+contain for a team logo, circle+cover for a driver photo - the same distinction
   * EntityAvatar's own `shape`/`fit` props already make everywhere else in this app. */
  entityIsLogo?: boolean;
  grid: number | null;
  finishText: string;
  finishRank: number | null;
  points: number;
};

export type ResultFilterKey = "wins" | "podiums" | "points" | "dnf";
type ResultFilter = { key: ResultFilterKey; label: string; test: (row: ExplorerRow) => boolean };

// A fixed registry, not a value the caller builds - a driver/team page (the two callers that use
// this at all) only ever wants some subset of these same four generic result types, and the actual
// predicates are pure ExplorerRow logic with nothing driver/team-specific in them. This used to be
// built server-side in archive/page.tsx as {key, label, test} objects and passed down as a prop -
// confirmed live (a real `next build`, not `next dev`) to throw "Functions cannot be passed
// directly to Client Components" the moment React tried to serialize that prop, since a closure
// isn't valid RSC payload data. The server now sends only which keys it wants
// (`resultFilterKeys: ResultFilterKey[]`, plain strings, always serializable); the actual filter
// objects - including their functions - are resolved here, entirely client-side, where they're the
// only thing that ever calls them anyway.
const RESULT_FILTERS: Record<ResultFilterKey, ResultFilter> = {
  wins: { key: "wins", label: "Wins", test: (r) => r.finishRank === 1 },
  podiums: { key: "podiums", label: "Podiums", test: (r) => r.finishRank !== null && r.finishRank <= 3 },
  points: { key: "points", label: "Points", test: (r) => r.points > 0 },
  dnf: { key: "dnf", label: "Retirements", test: (r) => r.finishRank === null },
};

const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };
const PAGE_SIZE = 20;

function decadeLabel(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * The dense, searchable, filterable race table every Archive entity detail page (driver/team/
 * circuit) shares - replaces the old flat ArchiveHistoryRaceList (a plain stack of link cards) for
 * a real career/circuit history of hundreds of races. Selecting a row (click or Enter/Space while
 * focused) is the ONLY thing that changes here - the caller owns what "selected" means and renders
 * its own focused panel from it, so the same table works for a driver's own races, a team's own
 * races, or a circuit's own races without three separate implementations.
 */
export function ArchiveRaceExplorer({
  rows,
  entityColumnLabel,
  resultFilterKeys,
  selectedId,
  onSelect,
}: {
  rows: ExplorerRow[];
  entityColumnLabel: string;
  /** Optional result-type filter chips (Wins/Podiums/Points/Retirements, say) - omitted entirely
   * when the caller has nothing meaningful to offer (a circuit explorer has no "this entity's own
   * result type" to filter by, for instance). Just the keys - see RESULT_FILTERS above for why the
   * actual filter objects (and their functions) are resolved here, not passed in. */
  resultFilterKeys?: ResultFilterKey[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const resultFilters = useMemo(() => resultFilterKeys?.map((key) => RESULT_FILTERS[key]), [resultFilterKeys]);
  const [search, setSearch] = useState("");
  const [decade, setDecade] = useState<string | null>(null);
  const [resultKey, setResultKey] = useState<string>("all");
  const [page, setPage] = useState(1);

  const decades = useMemo(() => [...new Set(rows.map((r) => decadeLabel(r.year)))].sort((a, b) => b.localeCompare(a)), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeFilter = resultFilters?.find((f) => f.key === resultKey);
    return rows.filter((r) => {
      if (decade && decadeLabel(r.year) !== decade) return false;
      if (activeFilter && !activeFilter.test(r)) return false;
      if (q && !`${r.year} ${r.raceName} ${r.entityLabel ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, decade, resultKey, resultFilters]);

  // Reset to page 1 whenever a filter actually narrows the result set differently - otherwise a
  // filter change could silently land on a now-out-of-range page showing nothing.
  const [prevFilterKey, setPrevFilterKey] = useState(`${search}:${decade}:${resultKey}`);
  const filterKey = `${search}:${decade}:${resultKey}`;
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search races…"
          className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white placeholder:text-neutral-600 focus:border-white/25 focus:outline-none sm:max-w-[200px]"
        />
        {decades.length > 1 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by decade">
            <button
              type="button"
              onClick={() => setDecade(null)}
              aria-pressed={decade === null}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${decade === null ? "bg-white/[0.1] text-white" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              All years
            </button>
            {decades.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDecade(d)}
                aria-pressed={decade === d}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${decade === d ? "bg-white/[0.1] text-white" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {resultFilters && resultFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by result">
            <button
              type="button"
              onClick={() => setResultKey("all")}
              aria-pressed={resultKey === "all"}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${resultKey === "all" ? "bg-white/[0.1] text-white" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              All results
            </button>
            {resultFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setResultKey(f.key)}
                aria-pressed={resultKey === f.key}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${resultKey === f.key ? "bg-white/[0.1] text-white" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.07] bg-[var(--f1-carbon)]/50">
        {paged.length === 0 ? (
          <div className="flex h-full min-h-[160px] items-center justify-center px-6 text-center text-sm text-neutral-500">
            No races match this filter.
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md" style={HEADER_STYLE}>
                <tr>
                  <th className="px-3 py-2.5 font-mono font-semibold">Year</th>
                  <th className="px-3 py-2.5 font-semibold">Race</th>
                  <th className="px-3 py-2.5 font-semibold">{entityColumnLabel}</th>
                  <th className="px-3 py-2.5 font-semibold">Grid</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Finish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--f1-line)]">
                {paged.map((r) => {
                  const isSelected = selectedId === r.id;
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      role="button"
                      aria-pressed={isSelected}
                      onClick={() => onSelect(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(r.id);
                        }
                      }}
                      className={`cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--f1-red)] ${
                        isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-[13px] font-medium text-white">{r.year}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-neutral-200">{r.raceName}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                        {r.entityLabel ? (
                          <div className="flex min-w-0 items-center gap-1.5">
                            {r.entityAvatarUrl !== undefined && (
                              <EntityAvatar imageUrl={r.entityAvatarUrl} name={r.entityLabel} size={r.entityIsLogo ? 16 : 20} shape={r.entityIsLogo ? "square" : "circle"} fit={r.entityIsLogo ? "contain" : "cover"} />
                            )}
                            <span className="truncate">{r.entityLabel}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-neutral-500">{r.grid != null ? `P${r.grid}` : "—"}</td>
                      <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${r.finishRank != null && r.finishRank <= 3 ? "font-semibold text-white" : "text-neutral-400"}`}>
                        {r.finishText}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex shrink-0 items-center justify-between pt-2">
          <span className="text-[11px] text-neutral-600">
            {filtered.length} race{filtered.length === 1 ? "" : "s"} · page {page} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
