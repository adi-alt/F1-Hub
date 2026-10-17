"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntityAvatar } from "@/components/EntityAvatar";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { raceHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";

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
  /** That team's or driver's own archive page, when it has one. */
  entityHref?: string | null;
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

// Resolved here, client-side: a closure can't be passed from a server component as a prop, so the server sends only
// the keys it wants (resultFilterKeys) and the predicates live with the only code that calls them.
const RESULT_FILTERS: Record<ResultFilterKey, ResultFilter> = {
  wins: { key: "wins", label: "Wins", test: (r) => r.finishRank === 1 },
  podiums: { key: "podiums", label: "Podiums", test: (r) => r.finishRank !== null && r.finishRank <= 3 },
  points: { key: "points", label: "Points", test: (r) => r.points > 0 },
  dnf: { key: "dnf", label: "Retirements", test: (r) => r.finishRank === null },
};

/** Ten races a page: the table sits under the chart on a driver's or team's page, and ten keeps it to one screen. */
const PAGE_SIZE = 10;

function decadeLabel(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-sm px-2.5 py-1 text-body-sm transition-colors duration-fast ${on ? "bg-white/[0.08] text-primary" : "text-secondary hover:text-primary"}`}
    >
      {children}
    </button>
  );
}

/**
 * Every race of a driver, team or circuit, searchable and filterable, and every row a way in: selecting a row opens
 * that race's page (the year is a real link, so it can be opened in a new tab too), and the team or driver in a row
 * opens their own archive page. Points are the weekend's: the Grand Prix plus that weekend's sprint.
 */
export function ArchiveRaceExplorer({ rows, entityColumnLabel, resultFilterKeys }: { rows: ExplorerRow[]; entityColumnLabel: string; resultFilterKeys?: ResultFilterKey[] }) {
  const router = useRouter();
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

  // Back to page 1 whenever the filters change, so a narrower result never lands on an empty page.
  const filterKey = `${search}:${decade}:${resultKey}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  if (rows.length === 0) return <p className="text-body-sm text-secondary">No races on record.</p>;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);
  const open = (r: ExplorerRow) => router.push(raceHref(r.year, r.round, r.raceName));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search races…"
          aria-label="Search races"
          className="h-9 w-full min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 text-body-sm text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-focus-ring sm:w-60"
        />
        {decades.length > 1 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by decade">
            <Chip on={decade === null} onClick={() => setDecade(null)}>
              All years
            </Chip>
            {decades.map((d) => (
              <Chip key={d} on={decade === d} onClick={() => setDecade(d)}>
                {d}
              </Chip>
            ))}
          </div>
        )}
        {resultFilters && resultFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by result">
            <Chip on={resultKey === "all"} onClick={() => setResultKey("all")}>
              All results
            </Chip>
            {resultFilters.map((f) => (
              <Chip key={f.key} on={resultKey === f.key} onClick={() => setResultKey(f.key)}>
                {f.label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {paged.length === 0 ? (
        <p className="py-10 text-center text-body-sm text-secondary">No races match this filter.</p>
      ) : (
        <div className={`overflow-x-auto ${PANEL}`}>
          <table className="w-full min-w-[34rem] text-left text-body-sm">
            <caption className="sr-only">Races</caption>
            <thead className={`border-b border-white/[0.06] ${EYEBROW}`}>
              <tr>
                <th scope="col" className="px-4 py-3">Year</th>
                <th scope="col" className="px-4 py-3">Race</th>
                <th scope="col" className="px-4 py-3">{entityColumnLabel}</th>
                <th scope="col" className="px-4 py-3 text-right">Grid</th>
                <th scope="col" className="px-4 py-3 text-right">Finish</th>
                <th scope="col" className="px-4 py-3 text-right">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {paged.map((r) => (
                <tr key={r.id} onClick={() => open(r)} onMouseEnter={() => router.prefetch(raceHref(r.year, r.round, r.raceName))} className="cursor-pointer transition-colors duration-fast hover:bg-white/[0.025]">
                  <td className="px-4 py-3 tabular">
                    <Link href={raceHref(r.year, r.round, r.raceName)} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">
                      {r.year}
                    </Link>
                  </td>
                  <td className="max-w-56 truncate px-4 py-3 text-primary">{r.raceName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-secondary">
                    {r.entityLabel ? (
                      <span className="flex min-w-0 items-center gap-2">
                        {/* A team is its colour, as on Season's tables, not a logo too small to read; a driver keeps their face. */}
                        {r.entityIsLogo ? (
                          <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ background: teamColor(r.entityLabel) }} />
                        ) : r.entityAvatarUrl !== undefined && (
                          <EntityAvatar imageUrl={r.entityAvatarUrl} name={r.entityLabel} size={22} fit="cover" />
                        )}
                        {r.entityHref ? (
                          <Link href={r.entityHref} onClick={(e) => e.stopPropagation()} className="truncate text-primary underline-offset-4 hover:underline">
                            {r.entityLabel}
                          </Link>
                        ) : (
                          <span className="truncate">{r.entityLabel}</span>
                        )}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-caption tabular text-tertiary">{r.grid ? `P${r.grid}` : "–"}</td>
                  <td className={`px-4 py-3 text-right tabular ${r.finishRank != null && r.finishRank <= 3 ? "font-semibold text-primary" : "text-secondary"}`}>{r.finishText}</td>
                  <td className={`px-4 py-3 text-right tabular ${r.points > 0 ? "font-semibold text-primary" : "text-tertiary"}`}>{r.points > 0 ? r.points : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-caption text-secondary">
            {filtered.length} race{filtered.length === 1 ? "" : "s"} · page {page} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-control px-3 py-1.5 text-body-sm text-secondary transition-colors hover:text-primary disabled:opacity-30">
              Previous
            </button>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} className="rounded-control px-3 py-1.5 text-body-sm text-secondary transition-colors hover:text-primary disabled:opacity-30">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
