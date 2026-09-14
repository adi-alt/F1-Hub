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
    <div className="flex flex-col gap-4 rounded-lg border border-white/[0.07] bg-[var(--f1-carbon)]/50 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{row.year}</p>
        <p className="mt-1 text-lg font-semibold text-white">{row.raceName}</p>
        {(row.circuitName || row.country) && <p className="mt-0.5 text-xs text-neutral-500">{[row.circuitName, row.country].filter(Boolean).join(", ")}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">{entityColumnLabel}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-neutral-200">{row.entityLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Grid</dt>
          <dd className="mt-0.5 font-mono text-sm text-neutral-200">{row.grid != null ? `P${row.grid}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Finish</dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold text-white">{row.finishText}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Points</dt>
          <dd className="mt-0.5 font-mono text-sm text-neutral-200">{row.points}</dd>
        </div>
      </dl>

      <Link
        href={raceHref(row.year, row.round, row.raceName)}
        className="mt-1 inline-flex w-fit items-center gap-1 rounded-lg bg-[var(--f1-red)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110"
      >
        View race →
      </Link>
    </div>
  );
}
