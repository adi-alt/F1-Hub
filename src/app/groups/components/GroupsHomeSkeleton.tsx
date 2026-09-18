import { Skeleton } from "@/components/ui/Skeleton";
import { GroupsRightSidebarSkeleton } from "./GroupsRightSidebarSkeleton";
import { PostCardSkeleton } from "./post/PostCardSkeleton";

/** Matches GroupsHomeClient's real 3-column shape exactly - same track widths, same surfaces, same
 * order-* stacking on mobile - so nothing reflows once real data swaps in. Each region's skeleton
 * mirrors that region's own geometry rather than one generic block standing in for all three. Note
 * the navigation rail has no card of its own here either: its rows sit directly on the page
 * background, the same as the real thing. */
export function GroupsHomeSkeleton() {
  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[212px_minmax(0,1fr)_268px] lg:items-start lg:gap-4">
      <aside className="order-2 lg:order-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-1.5 h-2.5 w-full" />
        <div className="mt-3 flex items-center gap-2 px-1.5 py-1.5">
          <Skeleton className="h-[26px] w-[26px] shrink-0 rounded-md" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="mt-2.5 border-t border-white/[0.06] pt-2.5">
          <Skeleton className="h-2 w-24" />
        </div>
        <div className="mt-1 space-y-px">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-1.5 py-1.5">
              <Skeleton className="h-[26px] w-[26px] shrink-0 rounded-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
        <div className="mt-2.5 border-t border-white/[0.06] pt-2.5">
          <Skeleton className="h-7 w-full rounded-lg" />
          <Skeleton className="mt-1 h-7 w-full rounded-lg" />
        </div>
      </aside>

      <main className="order-1 space-y-2.5 lg:order-2">
        <div className="rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <Skeleton className="h-[30px] w-[30px] shrink-0 rounded-full" />
            <Skeleton className="h-8 flex-1 rounded-lg" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-md" />
            <Skeleton className="h-6 w-12 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="ml-auto h-7 w-16 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-8 w-56 rounded-lg" />
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
