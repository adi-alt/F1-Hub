"use client";

/** Windows down to first/last/current-adjacent pages with an ellipsis for the gaps, e.g.
 * [1, 2, "...", 41, 42, 43, "...", 73, 74] for page 42 of 74 - never renders every page number for
 * a large total. Returns every page 1..total plainly once total is small enough that windowing
 * wouldn't save anything. */
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set<number>([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/** Shared pagination footer - Prev/Next (real disabled state at the boundaries, not conditionally
 * hidden, so the control's shape stays constant) plus windowed page numbers for larger result
 * sets, a plain "Page X of Y" label for small ones. Used by ArchiveTable; kept generic (no
 * archive-specific naming) in case another paginated list wants it later. */
export function Pagination({
  page,
  totalPages,
  totalItems,
  itemLabel,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  /** Singular noun, e.g. "driver" - pluralized here, not by the caller. */
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  const showNumbers = totalPages > 1;

  return (
    <nav aria-label="Pagination" className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm text-neutral-500">
      <span>
        {totalItems} {itemLabel}
        {totalItems === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="rounded-md border border-[var(--f1-line)] px-3 py-1 transition hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] disabled:pointer-events-none disabled:opacity-30"
        >
          ← Prev
        </button>
        {showNumbers &&
          pageNumbers(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1.5 text-neutral-600">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={`min-w-[1.75rem] rounded-md px-2 py-1 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                  p === page ? "bg-[var(--f1-red)] text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {p}
              </button>
            ),
          )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="rounded-md border border-[var(--f1-line)] px-3 py-1 transition hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] disabled:pointer-events-none disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
