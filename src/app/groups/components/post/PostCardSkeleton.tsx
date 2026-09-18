import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors PostCard's real geometry - same padding, same 34px identity avatar, the two-line header
 * a community post renders, and the same 28px control row - so a post swapping in over its own
 * placeholder doesn't move anything. */
export function PostCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/55 px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-2.5 w-28" />
        </div>
      </div>
      <Skeleton className="mt-2 h-3.5 w-full" />
      <Skeleton className="mt-1.5 h-3.5 w-4/5" />
      <div className="mt-2 flex items-center gap-1.5">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-14 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
    </div>
  );
}
