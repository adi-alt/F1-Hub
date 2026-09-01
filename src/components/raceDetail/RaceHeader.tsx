import Link from "next/link";
import { RaceActionsMenu } from "./RaceActionsMenu";

/** The identity block every race page opens with - back link + ⋮ actions on one row, then round/
 * name/meta, then a winner line. Shared by Season and Archive's race pages (both feed it plain
 * strings, nothing about either page's own data shape leaks in here). The external link (Full
 * race report / Wikipedia) moved into the ⋮ menu (RaceActionsMenu, the same component/pattern
 * Season's own ExportMenu already establishes) instead of sitting as its own visible line -
 * declutters the header without losing the action, and adds a real one (Copy link) that didn't
 * exist before. */
export function RaceHeader({
  backHref,
  backLabel,
  roundLabel,
  name,
  circuitName,
  locality,
  country,
  dateLabel,
  externalLink,
  resultLabel,
}: {
  backHref: string;
  backLabel: string;
  roundLabel?: string;
  name: string;
  circuitName?: string | null;
  locality?: string | null;
  country?: string | null;
  dateLabel?: string | null;
  externalLink?: { href: string; label: string };
  // A small, subtle textual result indicator (e.g. "Winner: Lando Norris").
  resultLabel?: string;
}) {
  const metaParts = [circuitName, locality, country].filter((p): p is string => !!p);

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--f1-line)] bg-white/[0.03] px-3 py-1 text-xs font-medium text-neutral-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        >
          ← {backLabel}
        </Link>
        <RaceActionsMenu externalLink={externalLink} />
      </div>
      <div className="mt-2">
        {roundLabel && <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">{roundLabel}</p>}
        <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">{name}</h1>
        {(metaParts.length > 0 || dateLabel) && (
          <p className="mt-2 text-sm text-neutral-500">
            {metaParts.join(", ")}
            {dateLabel && (metaParts.length > 0 ? ` · ${dateLabel}` : dateLabel)}
          </p>
        )}
        {resultLabel && <p className="mt-2 text-sm text-neutral-300">{resultLabel}</p>}
      </div>
    </div>
  );
}
