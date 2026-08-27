"use client";

import { useSearchParams } from "next/navigation";
import { ArchiveCircuitGridSkeleton } from "./components/ArchiveCircuitGridSkeleton";
import { ArchiveGridSkeleton } from "./components/ArchiveGridSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabBarSkeleton, TableFooterSkeleton, TableRowsSkeleton } from "@/components/ui/TableSkeleton";

const TABS = ["By year", "By track", "By driver", "By team"];

/** A client component (not the original static one) specifically so it can read useSearchParams()
 * and match whichever facet - or detail page - the navigation is actually headed toward, instead
 * of always showing the "by year" shape regardless. */
export default function ArchiveLoading() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section");
  const isDetailRoute = ["year", "round", "circuit", "driver", "team"].some((key) => searchParams.has(key));

  if (isDetailRoute) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-3 h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
      <Skeleton className="h-9 w-40 shrink-0" />
      <Skeleton className="mt-1 h-4 w-full max-w-lg shrink-0" />
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabBarSkeleton labels={TABS} />
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
