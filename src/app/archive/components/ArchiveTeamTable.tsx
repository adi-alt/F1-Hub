"use client";

import Link from "next/link";
import { archiveTeamHref } from "@/lib/routes";
import { ArchiveTable, type ArchiveTableColumn } from "./ArchiveTable";
import type { ArchiveTeam } from "@/lib/supabase/archive";

function buildColumns(activeTeamIds: Set<string>): ArchiveTableColumn<ArchiveTeam>[] {
  return [
    {
      key: "name",
      label: "Team",
      sortable: true,
      defaultDir: "asc",
      sortValue: (t) => t.name,
      render: (t) => (
        <Link href={archiveTeamHref(t.teamId)} className="truncate font-medium text-white hover:text-[var(--f1-red)]">
          {t.name}
        </Link>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      // Derived by reconciling the current season's roster against the archive (see
      // archive/page.tsx) - not stored on ArchiveTeam itself, and not a guess.
      render: (t) =>
        activeTeamIds.has(t.teamId) ? (
          <span className="rounded-full bg-[var(--f1-red)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--f1-red)]">Active</span>
        ) : (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Historical</span>
        ),
    },
    {
      key: "races",
      label: "Races",
      align: "right",
      sortable: true,
      defaultDir: "desc",
      sortValue: (t) => t.raceCount,
      render: (t) => <span className="text-neutral-400">{t.raceCount}</span>,
    },
    {
      key: "years",
      label: "Years",
      align: "right",
      render: (t) => <span className="whitespace-nowrap text-neutral-400">{t.firstYear === t.lastYear ? t.firstYear : `${t.firstYear}–${t.lastYear}`}</span>,
    },
    {
      key: "drivers",
      label: "Driver(s)",
      render: (t) => (
        <span className="block max-w-xs truncate text-neutral-500" title={t.drivers?.join(", ")}>
          {t.drivers?.length ? t.drivers.join(", ") : "N/A"}
        </span>
      ),
    },
  ];
}

/** ArchiveDriverTable's sibling - was previously a byte-for-byte duplicate implementation, now just
 * the column definitions for the shared ArchiveTable. See ArchiveTable.tsx for search/sort/
 * pagination/responsive/favoriting behavior. */
export function ArchiveTeamTable({
  teams,
  search,
  favoriteIds,
  onToggleFavorite,
  favoritesOnly,
  activeTeamIds,
}: {
  teams: ArchiveTeam[];
  search: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (teamId: string) => void;
  favoritesOnly?: boolean;
  activeTeamIds: Set<string>;
}) {
  return (
    <ArchiveTable
      rows={teams}
      columns={buildColumns(activeTeamIds)}
      getId={(t) => t.teamId}
      getSearchText={(t) => t.name}
      search={search}
      defaultSortKey="races"
      favoriteIds={favoriteIds}
      onToggleFavorite={onToggleFavorite}
      favoritesOnly={favoritesOnly}
      itemLabel="team"
      emptyMessage="No teams indexed yet, the entity-index pipeline pass hasn't run over this data yet."
    />
  );
}
