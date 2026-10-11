"use client";

import { useSearchParams } from "next/navigation";
import { ArchiveCircuitGridSkeleton } from "./components/ArchiveCircuitGridSkeleton";
import { ArchiveGridSkeleton } from "./components/ArchiveGridSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { SeasonDetailSkeleton } from "@/components/ui/SeasonDetailSkeleton";
import { TableFooterSkeleton, TableRowsSkeleton } from "@/components/ui/TableSkeleton";

const TABS = ["By year", "By track", "By driver", "By team"];

// Matches the facet switcher's underline Tabs strip (the same padding, 40px tabs 24px apart, one
// body-sm label each), so the real strip lands on top of it - not TabBarSkeleton
// (@/components/ui/TableSkeleton), which is still the right skeleton for personalization's own,
// still-capsule-styled tabs.
function FacetTabsSkeleton() {
  return (
    <div className="-mx-1 flex gap-6 px-1 py-1">
      {TABS.map((label, i) => (
        <span key={label} className="flex h-10 items-center">
          <Skeleton shape="text" className={i === 0 ? "w-14" : "w-16"} />
        </span>
      ))}
    </div>
  );
}

/** A client component (not the original static one) specifically so it can read useSearchParams()
 * and match whichever facet - or detail page - the navigation is actually headed toward, instead
 * of always showing the "by year" shape regardless. */
export default function ArchiveLoading() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section");
  // ?year= (without ?round=, a specific-race lookup that redirects immediately) renders the exact
  // same SeasonDetail component /season does - same skeleton, not the entity-explorer shape below.
  if (searchParams.has("year") && !searchParams.has("round")) return <SeasonDetailSkeleton />;

  // circuit/driver/team detail pages (ArchiveEntityHeader + ArchiveExplorerWithFocus) - matches
  // that real layout now: a viewport-locked header, then a two-column explorer/focused-panel
  // split, not the old flat list of link cards this page no longer renders.
  const isHistoryRoute = ["round", "circuit", "driver", "team"].some((key) => searchParams.has(key));
  if (isHistoryRoute) {
    return (
      <div role="status" className="page-wide skeleton-delay py-6">
        <span className="sr-only">Loading the archive</span>
        <div className="shrink-0">
          <Skeleton shape="block" className="h-4 w-16" />
          <div className="mt-2 flex items-center gap-3">
            <Skeleton shape="circle" className="h-11 w-11" />
            <div className="min-w-0 flex-1">
              <Skeleton shape="block" className="h-7 w-56" />
              <Skeleton shape="block" className="mt-1.5 h-4 w-40" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} shape="block" className="h-10 w-16" />
            ))}
          </div>
        </div>
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col">
            <Skeleton shape="block" className="mb-3 h-8 w-full max-w-xs" />
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.07]">
              <TableRowsSkeleton />
            </div>
          </div>
          <Skeleton shape="block" className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="page-wide skeleton-delay py-6">
        <span className="sr-only">Loading the archive</span>
      <Skeleton shape="block" className="h-9 w-40 shrink-0" />
      <Skeleton shape="block" className="mt-1 h-4 w-full max-w-lg shrink-0" />
      <div className="mt-4 flex flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <FacetTabsSkeleton />
          <Skeleton shape="circle" className="h-8 w-full max-w-xs" />
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-hidden">
          {section === "track" ? (
            <ArchiveCircuitGridSkeleton />
          ) : section === "driver" || section === "team" ? (
            <div className="flex h-full flex-col">
              <TableRowsSkeleton />
              <TableFooterSkeleton />
            </div>
          ) : (
            <ArchiveGridSkeleton />
          )}
        </div>
      </div>
    </div>
  );
}
