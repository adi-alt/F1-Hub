"use client";

import { InsightSkeleton, LoadingRegion } from "@/components/ui/Skeletons";

/** Apex's per-section insight (Battles / Records / Progression / Compare).
 *
 * Plain editorial text behind a small eyebrow - no box, no border, no tinted background. A
 * coloured container around a normal sentence reads as a warning, not an insight, and it was one
 * of the things making the page look like a generic dashboard. Hierarchy comes from type size and
 * a single hairline rule instead. */
export function SeasonInsight({ eyebrow = "Apex", headline, summary }: { eyebrow?: string; headline: string; summary: string }) {
  return (
    <div className="mb-5 max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{headline}</p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-400">{summary}</p>
    </div>
  );
}

/** The one Apex label treatment on the page. Small, wide-tracked, with the red mark - used
 * sparingly so uppercase micro-labels stay meaningful rather than becoming the page's default
 * voice. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500 ${className}`}>
      <span aria-hidden className="text-[var(--f1-red)]">
        ✦
      </span>
      {children}
    </p>
  );
}

export function SeasonInsightSkeleton({ label = "Loading Apex insight" }: { label?: string }) {
  return (
    <LoadingRegion label={label}>
      <InsightSkeleton className="mb-5 max-w-2xl" lines={2} />
    </LoadingRegion>
  );
}
