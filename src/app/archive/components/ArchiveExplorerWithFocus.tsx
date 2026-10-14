"use client";

import { ArchiveRaceExplorer, type ExplorerRow, type ResultFilterKey } from "./ArchiveRaceExplorer";

/** The race list on a driver, team or circuit page. It used to sit beside a "focused race" panel that a row click
 * filled in - on a phone that panel was below the whole table, so a click looked like it did nothing. Now every row
 * opens its race directly, full width. */
export function ArchiveExplorerWithFocus({ rows, entityColumnLabel, resultFilterKeys }: { rows: ExplorerRow[]; entityColumnLabel: string; resultFilterKeys?: ResultFilterKey[] }) {
  return <ArchiveRaceExplorer rows={rows} entityColumnLabel={entityColumnLabel} resultFilterKeys={resultFilterKeys} />;
}
