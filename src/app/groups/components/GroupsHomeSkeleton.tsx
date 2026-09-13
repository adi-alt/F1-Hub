import { Skeleton } from "@/components/ui/Skeleton";
import { GroupsRightSidebarSkeleton } from "./GroupsRightSidebarSkeleton";
import { PostCardSkeleton } from "./post/PostCardSkeleton";

/** Matches GroupsHomeClient's real 3-column shape exactly (same order-* stacking on mobile) so
 * there's no reflow once real data swaps in - each region's own skeleton mirrors that region's
 * real geometry rather than a single generic block standing in for the whole thing. */
export function GroupsHomeSkeleton() {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:gap-5 lg:items-start">
      <aside className="order-2 space-y-2 lg:order-1">
        <Skeleton className="h-3 w-20" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <Skeleton className="h-[26px] w-[26px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-2.5 w-3/5" />
            </div>
          </div>
        ))}
        <Skeleton className="mt-2 h-8 w-full rounded-full" />
        <Skeleton className="h-8 w-full rounded-full" />
      </aside>

      <main className="order-1 space-y-3 lg:order-2">
        <Skeleton className="h-11 w-full rounded-lg" />
        <div className="flex gap-4 border-b border-[var(--f1-line)] pb-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-14" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </main>

      <aside className="order-3">
        <GroupsRightSidebarSkeleton />
      </aside>
    </div>
  );
}
