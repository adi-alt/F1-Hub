import Link from "next/link";

/** The identity block every race page opens with - back link, round, name, circuit/locality/
 * country/date. Shared by Season and Archive's race pages (both feed it plain strings, nothing
 * about either page's own data shape leaks in here). `externalLink` is deliberately subtle -
 * neutral gray text, not the app's red accent - the user's own explicit ask was "keep external
 * links subtle... do not make Wikipedia visually dominant". */
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
}) {
  const metaParts = [circuitName, locality, country].filter((p): p is string => !!p);

  return (
    <div>
      <Link href={backHref} className="text-sm text-neutral-500 transition hover:text-neutral-300">
        ← {backLabel}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          {roundLabel && <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">{roundLabel}</p>}
          <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">{name}</h1>
          {(metaParts.length > 0 || dateLabel) && (
            <p className="mt-2 text-sm text-neutral-500">
              {metaParts.join(", ")}
              {dateLabel && (metaParts.length > 0 ? ` · ${dateLabel}` : dateLabel)}
            </p>
          )}
        </div>
        {externalLink && (
          <a
            href={externalLink.href}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sm text-neutral-500 transition hover:text-neutral-300"
          >
            {externalLink.label} →
          </a>
        )}
      </div>
    </div>
  );
}
