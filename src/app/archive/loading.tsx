import { ArchiveGridSkeleton } from "./components/ArchiveGridSkeleton";
import { TabBarSkeleton } from "@/components/ui/TableSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors ArchiveExplorer's real structure — same capsule tab-bar, same badge-grid shape as the
 * default "By year" facet (the actual landing state for a plain /archive visit) — so nothing
 * visibly reflows once the real data paints in over it. Driver/team deep links land on the table
 * shape instead once real data arrives; a static loading.tsx can't know which facet a given
 * navigation is headed for ahead of time, so this matches the single most common case. */
export default function ArchiveLoading() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-4 py-6 sm:px-6">
      <Skeleton className="h-9 w-40 shrink-0" />
      <Skeleton className="mt-1 h-4 w-full max-w-lg shrink-0" />
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabBarSkeleton labels={["By year", "By track", "By driver", "By team"]} />
        <div className="mt-4 min-h-0 flex-1 overflow-hidden">
          <ArchiveGridSkeleton />
        </div>
      </div>
    </div>
  );
}
