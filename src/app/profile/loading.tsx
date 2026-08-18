import { TabBarSkeleton, TableFooterSkeleton, TableRowsSkeleton } from "@/components/ui/TableSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors PersonalizationTabs + FavoriteEntityList's real structure — same capsule tab-bar,
 * same 6-column table shape, same footer — so nothing visibly reflows once the real data paints
 * in over it. */
export default function ProfileLoading() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl flex-col px-4 py-6 sm:px-6">
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
