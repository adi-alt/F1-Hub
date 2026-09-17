import { Skeleton } from "@/components/ui/Skeleton";
import { GroupsRightSidebarSkeleton } from "./GroupsRightSidebarSkeleton";
import { PostCardSkeleton } from "./post/PostCardSkeleton";

/** Matches GroupsHomeClient's real 3-column shape exactly - same track widths, same card surfaces,
 * same order-* stacking on mobile - so nothing reflows once real data swaps in. Each region's
 * skeleton mirrors that region's own geometry rather than one generic block standing in for all
 * three. */
export function GroupsHomeSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[286px_minmax(0,1fr)_306px] lg:items-start lg:gap-4">
      <aside className="order-2 rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 p-5 lg:order-1">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2.5 h-3 w-full" />
        <Skeleton className="mt-1.5 h-3 w-2/3" />
        <Skeleton className="mt-6 h-2.5 w-28" />
        <div className="mt-3 space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </aside>

      <main className="order-1 space-y-4 lg:order-2">
        <div className="rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <Skeleton className="h-11 flex-1 rounded-xl" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Skeleton className="h-7 w-24 rounded-lg" />
            <Skeleton className="h-7 w-14 rounded-lg" />
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="ml-auto h-9 w-20 rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-9 w-64 rounded-lg" />
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
