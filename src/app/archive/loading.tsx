"use client";

import { useSearchParams } from "next/navigation";
import { ArchiveCircuitGridSkeleton } from "./components/ArchiveCircuitGridSkeleton";
import { ArchiveGridSkeleton } from "./components/ArchiveGridSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { SeasonDetailSkeleton } from "@/components/ui/SeasonDetailSkeleton";
import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";
import { TableFooterSkeleton, TableRowsSkeleton } from "@/components/ui/TableSkeleton";

const TABS = ["By year", "By track", "By driver", "By team"];

// Matches QuietTabs' own shape (plain text tabs with a thin underline, no pill/bordered-track
// background) now that Archive's facet switcher uses that shared component directly instead of a
// bespoke capsule - not TabBarSkeleton (@/components/ui/TableSkeleton), which is still the right
// skeleton for personalization's own, still-capsule-styled tabs.
function QuietTabsSkeleton() {
  return (
    <div className="flex items-center gap-5">
      {TABS.map((label, i) => (
        <Skeleton key={label} className={`h-4 ${i === 0 ? "w-14" : "w-16"}`} />
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
      <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
        <div className="shrink-0">
          <SectionLoadingMessage label="Digging through the archive…" />
          <Skeleton className="h-4 w-16" />
          <div className="mt-2 flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="mt-1.5 h-4 w-40" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-16" />
            ))}
          </div>
        </div>
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col">
            <Skeleton className="mb-3 h-8 w-full max-w-xs rounded-md" />
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.07]">
              <TableRowsSkeleton />
            </div>
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
      <div className="shrink-0">
        <SectionLoadingMessage label="Digging through the archive…" />
      </div>
      <Skeleton className="h-9 w-40 shrink-0" />
      <Skeleton className="mt-1 h-4 w-full max-w-lg shrink-0" />
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <QuietTabsSkeleton />
          <Skeleton className="h-8 w-full max-w-xs rounded-full" />
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
