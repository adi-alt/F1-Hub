"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { archiveTeamHref } from "@/lib/routes";
import { FavoriteButton } from "./FavoriteButton";
import type { ArchiveTeam } from "@/lib/firestore/archive";

type SortKey = "name" | "races";
const PAGE_SIZE = 20;

export function ArchiveTeamTable({
  teams,
  search,
  favoriteIds,
  onToggleFavorite,
}: {
  teams: ArchiveTeam[];
  search: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (teamId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("races");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? teams.filter((t) => t.name.toLowerCase().includes(q)) : teams;
    const list = [...filtered];
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name) : a.raceCount - b.raceCount;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [teams, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

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

  if (teams.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        No teams indexed yet — the entity-index pipeline pass hasn&apos;t run over this data yet.
      </p>
    );
  }
  if (sorted.length === 0) {
    return <p className="mt-8 text-sm text-neutral-500">No teams match &ldquo;{search}&rdquo;.</p>;
  }

  return (
    <div className="mt-8">
      <div className="overflow-x-auto rounded-xl border border-[var(--f1-line)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--f1-line)] bg-white/[0.03] text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-10 px-3 py-2.5" aria-hidden />
              <th className="cursor-pointer select-none px-3 py-2.5" onClick={() => toggleSort("name")}>
                Team{sortIndicator("name")}
              </th>
              <th className="px-3 py-2.5">Years active</th>
              <th className="cursor-pointer select-none px-3 py-2.5" onClick={() => toggleSort("races")}>
                Races{sortIndicator("races")}
              </th>
              <th className="px-3 py-2.5">Driver(s)</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((t) => (
              <tr key={t.teamId} className="border-b border-[var(--f1-line)]/60 transition hover:bg-white/[0.03]">
                <td className="px-3 py-2.5">
                  <FavoriteButton favorited={favoriteIds.has(t.teamId)} onToggle={() => onToggleFavorite(t.teamId)} />
                </td>
                <td className="px-3 py-2.5">
                  <Link href={archiveTeamHref(t.teamId)} className="font-medium text-white hover:text-[var(--f1-red)]">
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-neutral-400">
                  {t.firstYear === t.lastYear ? t.firstYear : `${t.firstYear}–${t.lastYear}`}
                </td>
                <td className="px-3 py-2.5 text-neutral-400">{t.raceCount}</td>
                <td className="max-w-xs truncate px-3 py-2.5 text-neutral-500" title={t.drivers?.join(", ")}>
                  {t.drivers?.length ? t.drivers.join(", ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={pageSafe === 1}
          className="rounded-full border border-[var(--f1-line)] px-3 py-1 transition hover:border-white/30 hover:text-white disabled:opacity-40 disabled:hover:border-[var(--f1-line)] disabled:hover:text-neutral-500"
        >
          ← Prev
        </button>
        <span>
          Page {pageSafe} of {totalPages} · {sorted.length} team{sorted.length === 1 ? "" : "s"}
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
