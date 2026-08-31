"use client";

import Link from "next/link";
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
    // No photo - Archive is the restrained, statistical/reference counterpart to Season's richer
    // identity-driven cards (see SeasonCard's own comment); the driver's own name is the entire
    // identity element here. ArchiveDriver.photoUrl still exists in the data layer, unused by
    // this table on purpose, not deleted - Season still uses the same field.
    render: (d) => (
      <Link href={archiveDriverHref(d.driverId)} title={d.name} className="truncate font-medium text-white hover:text-[var(--f1-red)]">
        {d.name}
      </Link>
    ),
  },
  {
    key: "races",
    label: "Races",
    align: "right",
    sortable: true,
    defaultDir: "desc",
    widthClassName: "w-16",
    sortValue: (d) => d.raceCount,
    render: (d) => <span className="text-neutral-400">{d.raceCount}</span>,
  },
  {
    key: "years",
    label: "Years",
    align: "right",
    widthClassName: "w-24",
    render: (d) => <span className="whitespace-nowrap text-neutral-400">{d.firstYear === d.lastYear ? d.firstYear : `${d.firstYear}–${d.lastYear}`}</span>,
  },
  {
    key: "constructors",
    label: "Constructor(s)",
    hideOnMobile: true,
    widthClassName: "w-56",
    render: (d) => (
      <span className="block truncate text-neutral-500" title={d.constructors?.join(", ")}>
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
