"use client";

import { useMemo, useState } from "react";
import { ArchiveRaceExplorer, type ExplorerRow, type ResultFilter } from "./ArchiveRaceExplorer";
import { ArchiveFocusedRacePanel } from "./ArchiveFocusedRacePanel";

/**
 * Owns the one piece of client state every entity detail page needs (which race is currently
 * selected) and composes the shared explorer table with its focused panel - defaults to the most
 * recent race so the panel is never empty on first load. This is the only client boundary the
 * driver/team/circuit detail pages need; everything else about them is server-rendered.
 */
export function ArchiveExplorerWithFocus({
  rows,
  entityColumnLabel,
  resultFilters,
}: {
  rows: ExplorerRow[];
  entityColumnLabel: string;
  resultFilters?: ResultFilter[];
}) {
  const mostRecent = useMemo(() => [...rows].sort((a, b) => b.year - a.year || b.round - a.round)[0] ?? null, [rows]);
  const [selectedId, setSelectedId] = useState<string | null>(mostRecent?.id ?? null);
  const selected = rows.find((r) => r.id === selectedId) ?? mostRecent;

  if (rows.length === 0) {
    return <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-white/10 px-6 text-center text-sm text-neutral-500">No races on record.</div>;
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <ArchiveRaceExplorer rows={rows} entityColumnLabel={entityColumnLabel} resultFilters={resultFilters} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      <div className="min-w-0">{selected && <ArchiveFocusedRacePanel row={selected} entityColumnLabel={entityColumnLabel} />}</div>
    </div>
  );
}
