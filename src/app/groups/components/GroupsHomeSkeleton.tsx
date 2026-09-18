import { Skeleton } from "@/components/ui/Skeleton";
import { GroupsRightSidebarSkeleton } from "./GroupsRightSidebarSkeleton";
import { PostCardSkeleton } from "./post/PostCardSkeleton";

/** Matches GroupsHomeClient's real 3-column shape exactly - same track widths, same card surfaces,
 * same order-* stacking on mobile - so nothing reflows once real data swaps in. Each region's
 * skeleton mirrors that region's own geometry (48px navigation rows, a 34px composer avatar, the
 * compact control row) rather than one generic block standing in for all three. */
export function GroupsHomeSkeleton() {
  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[248px_minmax(0,1fr)_296px] lg:items-start lg:gap-3">
      <aside className="order-2 rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 p-3 lg:order-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-1.5 h-2.5 w-full" />
        <Skeleton className="mt-1 h-2.5 w-2/3" />
        <Skeleton className="mt-3.5 h-2.5 w-28" />
        <div className="mt-1.5 divide-y divide-white/[0.05]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5 border-t border-white/[0.07] pt-3">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      </aside>

      <main className="order-1 space-y-2.5 lg:order-2">
        <div className="rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-full" />
            <Skeleton className="h-9 flex-1 rounded-lg" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-md" />
            <Skeleton className="h-6 w-12 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="ml-auto h-[30px] w-16 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-8 w-56 rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </main>

      <aside className="order-3">
        <GroupsRightSidebarSkeleton />
      </aside>
    </div>
  );
}
