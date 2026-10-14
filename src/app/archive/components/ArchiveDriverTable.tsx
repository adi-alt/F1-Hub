"use client";

import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { archiveDriverHref } from "@/lib/routes";
import { ArchiveTable, type ArchiveTableColumn } from "./ArchiveTable";
import type { ArchiveDriver } from "@/lib/supabase/archive";

// Real widths (table-fixed) on every column but name - name absorbs whatever's left, so column
// proportions stay constant across pages/searches instead of following the current page's content.
const COLUMNS: ArchiveTableColumn<ArchiveDriver>[] = [
  {
    key: "name",
    label: "Driver",
    sortable: true,
    defaultDir: "asc",
    sortValue: (d) => d.name,
    // The face with the name, as everywhere else on the site; the whole row opens the driver (rowHref).
    render: (d) => (
      <span className="flex min-w-0 items-center gap-3">
        <EntityAvatar imageUrl={d.photoUrl ?? null} name={d.name} size={28} />
        <Link href={archiveDriverHref(d.driverId)} title={d.name} className="truncate font-medium text-primary underline-offset-4 hover:underline">
          {d.name}
        </Link>
      </span>
    ),
  },
  {
    key: "races",
    label: "Races",
    align: "right",
    sortable: true,
    defaultDir: "desc",
    widthClassName: "w-24",
    sortValue: (d) => d.raceCount,
    render: (d) => <span className="tabular text-secondary">{d.raceCount}</span>,
  },
  {
    key: "years",
    label: "Years",
    align: "right",
    widthClassName: "w-32",
    render: (d) => <span className="whitespace-nowrap tabular text-secondary">{d.firstYear === d.lastYear ? d.firstYear : `${d.firstYear}–${d.lastYear}`}</span>,
  },
  {
    key: "constructors",
    label: "Teams",
    hideOnMobile: true,
    widthClassName: "w-56",
    render: (d) => (
      <span className="block truncate text-tertiary" title={d.constructors?.join(", ")}>
        {d.constructors?.length ? d.constructors.join(", ") : "N/A"}
      </span>
    ),
  },
];

/** Every driver ArchiveTeamTable's sibling function once duplicated verbatim - now just the column
 * definitions for the shared ArchiveTable. See ArchiveTable.tsx for search/sort/pagination/
 * responsive/favoriting behavior. */
export function ArchiveDriverTable({
  drivers,
  search,
  favoriteIds,
  onToggleFavorite,
  favoritesOnly,
  onClearFilters,
}: {
  drivers: ArchiveDriver[];
  search: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (driverId: string) => void;
  favoritesOnly?: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <ArchiveTable
      rows={drivers}
      columns={COLUMNS}
      getId={(d) => d.driverId}
      rowHref={(d) => archiveDriverHref(d.driverId)}
      getSearchText={(d) => d.name}
      search={search}
      defaultSortKey="races"
      favoriteIds={favoriteIds}
      onToggleFavorite={onToggleFavorite}
      favoritesOnly={favoritesOnly}
      itemLabel="driver"
      emptyMessage="No drivers indexed yet, the driver-index pipeline pass hasn't run over this data yet."
      onClearFilters={onClearFilters}
    />
  );
}
