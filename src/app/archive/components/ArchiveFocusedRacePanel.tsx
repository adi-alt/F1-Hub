import Link from "next/link";
import { raceHref } from "@/lib/routes";
import type { ExplorerRow } from "./ArchiveRaceExplorer";

/**
 * The persistent right-side detail for whichever race is currently selected in an
 * ArchiveRaceExplorer - the same panel a click OR a keyboard Enter/Space on a row updates, so
 * "hover shows a preview, keyboard must expose equivalent information" (this app's own stated
 * requirement) is satisfied by construction rather than needing a second, hover-only code path.
 * Everything it needs already lives on the row itself (see ExplorerRow) - no separate lookup, and
 * no function prop crossing the server/client boundary to build one.
 */
export function ArchiveFocusedRacePanel({ row, entityColumnLabel }: { row: ExplorerRow; entityColumnLabel: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-subtle bg-surface-1 p-4">
      <div>
        <p className="text-caption text-secondary">{row.year}</p>
        <p className="mt-1 text-lg font-semibold text-primary">{row.raceName}</p>
        {(row.circuitName || row.country) && <p className="mt-0.5 text-xs text-tertiary">{[row.circuitName, row.country].filter(Boolean).join(", ")}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-caption text-secondary">{entityColumnLabel}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-primary">{row.entityLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-caption text-secondary">Grid</dt>
          <dd className="mt-0.5 text-sm text-primary">{row.grid != null ? `P${row.grid}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-caption text-secondary">Finish</dt>
          <dd className="mt-0.5 text-sm font-semibold text-primary">{row.finishText}</dd>
        </div>
        <div>
          <dt className="text-caption text-secondary">Points</dt>
          <dd className="mt-0.5 text-sm text-primary">{row.points}</dd>
        </div>
      </dl>

      <Link
        href={raceHref(row.year, row.round, row.raceName)}
        className="mt-1 inline-flex w-fit items-center gap-1 rounded-lg bg-[var(--f1-red)] px-3 py-1.5 text-caption font-semibold text-primary transition hover:brightness-110"
      >
        View race →
      </Link>
    </div>
  );
}
