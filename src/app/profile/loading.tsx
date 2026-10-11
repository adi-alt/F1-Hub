import { TabBarSkeleton, TableFooterSkeleton, TableRowsSkeleton } from "@/components/ui/TableSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors PersonalizationTabs + FavoriteEntityList's real structure — same capsule tab-bar,
 * same 6-column table shape, same footer — so nothing visibly reflows once the real data paints
 * in over it. */
export default function ProfileLoading() {
  return (
    <div role="status" className="page-content skeleton-delay py-6">
      <span className="sr-only">Loading your profile</span>
      <Skeleton shape="block" className="h-9 w-64 shrink-0" />
      <Skeleton shape="block" className="mt-2 h-4 w-full max-w-lg shrink-0" />
      <div className="mt-4 flex flex-col">
        <TabBarSkeleton labels={["Players", "Teams", "Circuits"]} />
        <div className="mt-4 flex flex-col">
          <TableRowsSkeleton />
          <TableFooterSkeleton />
        </div>
      </div>
    </div>
  );
}
