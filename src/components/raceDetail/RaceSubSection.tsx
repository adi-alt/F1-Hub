import type { ReactNode } from "react";

/**
 * A sub-section inside a race section: an h3 and its content, separated from the one before it by space and
 * a hairline, never another box (spec §3.3: no nested boxes, sub-sections use h3 plus spacing).
 */
export function RaceSubSection({
  label,
  description,
  first,
  headerRight,
  children,
}: {
  label: string;
  description?: string;
  first?: boolean;
  // A control that belongs to this sub-section only.
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={first ? "" : "mt-8 border-t border-subtle pt-8"}>
      {/* Wraps: a filter beside a long label drops under it on a narrow screen instead of pushing the page wider. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="min-w-0 text-title-md text-primary">{label}</h3>
        {headerRight}
      </div>
      {description && <p className="mt-1 text-body-sm text-secondary">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
