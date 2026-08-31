"use client";

import Link from "next/link";
import { archiveTeamHref } from "@/lib/routes";
import { ArchiveTable, type ArchiveTableColumn } from "./ArchiveTable";
import { StatusBadge } from "./StatusBadge";
import type { ArchiveTeam } from "@/lib/supabase/archive";

// Real widths (table-fixed) on every column but name - see ArchiveDriverTable's own comment.
function buildColumns(activeTeamIds: Set<string>): ArchiveTableColumn<ArchiveTeam>[] {
  return [
    {
      key: "name",
      label: "Team",
      sortable: true,
      defaultDir: "asc",
      sortValue: (t) => t.name,
      // No logo - Archive is the restrained, statistical/reference counterpart to Season's richer
      // identity-driven cards; the team's own name is the entire identity element here.
      render: (t) => (
        <Link href={archiveTeamHref(t.teamId)} title={t.name} className="truncate font-medium text-white hover:text-[var(--f1-red)]">
          {t.name}
        </Link>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "center",
      widthClassName: "w-20",
      // Derived by reconciling the current season's roster against the archive (see
      // archive/page.tsx) - not stored on ArchiveTeam itself, and not a guess.
      render: (t) => <StatusBadge active={activeTeamIds.has(t.teamId)} />,
    },
    {
      key: "races",
      label: "Races",
      align: "right",
      sortable: true,
      defaultDir: "desc",
      widthClassName: "w-16",
      sortValue: (t) => t.raceCount,
      render: (t) => <span className="text-neutral-400">{t.raceCount}</span>,
    },
    {
      key: "years",
      label: "Years",
      align: "right",
      widthClassName: "w-24",
      render: (t) => <span className="whitespace-nowrap text-neutral-400">{t.firstYear === t.lastYear ? t.firstYear : `${t.firstYear}–${t.lastYear}`}</span>,
    },
    {
      key: "drivers",
      label: "Driver(s)",
      hideOnMobile: true,
      widthClassName: "w-56",
      render: (t) => (
        <span className="block truncate text-neutral-500" title={t.drivers?.join(", ")}>
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
  onClearFilters,
}: {
  teams: ArchiveTeam[];
  search: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (teamId: string) => void;
  favoritesOnly?: boolean;
  activeTeamIds: Set<string>;
  onClearFilters?: () => void;
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
      onClearFilters={onClearFilters}
    />
  );
}
