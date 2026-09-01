import Link from "next/link";
import { RaceActionsMenu } from "./RaceActionsMenu";

/** The identity block every race page opens with - Season -> Round -> Grand Prix, in that order,
 * matching SeasonDetail.tsx's own "{year} SEASON" heading style (text-*xl font-bold tracking-tight)
 * one size down, since here the year is a breadcrumb back into that page, not the page's own
 * subject. A plain pill-button back link read as disconnected from the rest of the identity block
 * it sat above - making the year itself the clickable element (same convention as every other
 * "label →" link on this page - Track History, Wikipedia) is what makes it read as part of the
 * hierarchy instead of a floating control. The ⋮ menu stays pinned top-right, aligned to the year
 * line, so it doesn't get lost now that the year itself is much bigger. Shared by Season and
 * Archive's race pages (both feed it plain strings, nothing about either page's own data shape
 * leaks in here). */
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
      <div className="flex items-start justify-between">
        <Link href={backHref} className="group inline-flex items-center gap-1.5">
          <span className="text-2xl font-bold tracking-tight text-white transition group-hover:text-neutral-300 sm:text-3xl">{backLabel}</span>
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-neutral-400" aria-hidden>
            <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
