import { Skeleton } from "@/components/ui/Skeleton";
import { FeedPostSkeleton } from "./FeedPostSkeleton";

/** Matches GroupsHomeClient's real 3-column shape exactly (same order-* stacking on mobile) so
 * there's no reflow once real data swaps in. */
export function GroupsHomeSkeleton() {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)_300px] lg:items-start">
      <aside className="order-2 space-y-2 lg:order-1">
        <Skeleton className="h-3 w-20" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </aside>

      <main className="order-1 space-y-3 lg:order-2">
        <Skeleton className="h-24 w-full rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <FeedPostSkeleton key={i} />
        ))}
      </main>

      <aside className="order-3 space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </aside>
    </div>
  );
}
