import { TabBarSkeleton, TableFooterSkeleton, TableRowsSkeleton } from "@/components/ui/TableSkeleton";
import { Skeleton } from "@/components/ui/LegacySkeleton";

/** Mirrors PersonalizationTabs + FavoriteEntityList's real structure — same capsule tab-bar,
 * same 6-column table shape, same footer — so nothing visibly reflows once the real data paints
 * in over it. */
export default function ProfileLoading() {
  return (
    <div role="status" className="page-content skeleton-delay flex h-[calc(100dvh-4rem)] flex-col py-6">
      <span className="sr-only">Loading your profile</span>
      <Skeleton className="h-9 w-64 shrink-0" />
      <Skeleton className="mt-2 h-4 w-full max-w-lg shrink-0" />
      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabBarSkeleton labels={["Players", "Teams", "Circuits"]} />
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
          <TableRowsSkeleton />
          <TableFooterSkeleton />
        </div>
      </div>
    </div>
  );
}
