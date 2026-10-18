"use client";

import { useSearchParams } from "next/navigation";
import { ArchiveCircuitGridSkeleton } from "./components/ArchiveCircuitGridSkeleton";
import { ArchiveGridSkeleton } from "./components/ArchiveGridSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArchiveEntityBodySkeleton, ArchiveEntityHeadSkeleton } from "./components/ArchiveEntitySkeletons";
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
  const section = searchParams.get("tab");
  // ?year= (without ?round=, a specific-race lookup that redirects immediately) renders the exact
  // same SeasonDetail component /season does - same skeleton, not the entity-explorer shape below.
  if (searchParams.has("year") && !searchParams.has("round")) return <SeasonDetailSkeleton />;

  // A driver's or team's page: the same stand-ins the page streams behind (ArchiveEntitySkeletons), so the shape
  // doesn't change between the route loading and the page's own parts arriving.
  if (searchParams.has("driver") || searchParams.has("team")) {
    return (
      <div className="page-wide skeleton-delay py-8">
        <ArchiveEntityHeadSkeleton photo={searchParams.has("driver")} />
        <ArchiveEntityBodySkeleton />
      </div>
    );
  }
  // A circuit's page: the header and figures, the circuit and its winners, then every Grand Prix there.
  if (searchParams.has("circuit") || searchParams.has("round")) {
    return (
      <div role="status" className="page-wide skeleton-delay py-8">
        <span className="sr-only">Loading the archive</span>
        <ArchiveEntityHeadSkeleton photo={false} />
        <Skeleton shape="block" className="mt-4 h-5 w-full max-w-xl" />
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton shape="block" className="h-3 w-16" />
              <Skeleton shape="block" className="mt-2 h-6 w-12" />
            </div>
          ))}
        </div>
        <Skeleton shape="block" className="mt-10 h-3 w-48" />
        <div className="mt-4 grid gap-8 rounded-lg border border-white/[0.06] p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Skeleton shape="block" className="aspect-[3/2] w-full" />
          <div className="space-y-4 self-center">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} shape="block" className="h-5 w-full" />
            ))}
          </div>
        </div>
        <Skeleton shape="block" className="mt-10 h-[24rem] w-full" />
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
