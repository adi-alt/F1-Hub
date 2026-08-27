"use client";

import Link from "next/link";
import { archiveDriverHref } from "@/lib/routes";
import { ArchiveTable, type ArchiveTableColumn } from "./ArchiveTable";
import type { ArchiveDriver } from "@/lib/supabase/archive";

const COLUMNS: ArchiveTableColumn<ArchiveDriver>[] = [
  {
    key: "name",
    label: "Driver",
    sortable: true,
    defaultDir: "asc",
    sortValue: (d) => d.name,
    render: (d) => (
      <Link href={archiveDriverHref(d.driverId)} className="truncate font-medium text-white hover:text-[var(--f1-red)]">
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
    sortValue: (d) => d.raceCount,
    render: (d) => <span className="text-neutral-400">{d.raceCount}</span>,
  },
  {
    key: "years",
    label: "Years",
    align: "right",
    widthClassName: "whitespace-nowrap",
    render: (d) => <span className="whitespace-nowrap text-neutral-400">{d.firstYear === d.lastYear ? d.firstYear : `${d.firstYear}–${d.lastYear}`}</span>,
  },
  {
    key: "constructors",
    label: "Constructor(s)",
    render: (d) => (
      <span className="block max-w-xs truncate text-neutral-500" title={d.constructors?.join(", ")}>
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
}: {
  drivers: ArchiveDriver[];
  search: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (driverId: string) => void;
  favoritesOnly?: boolean;
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
    />
  );
}
