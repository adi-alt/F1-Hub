import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors PostCard's real default geometry - same card, same 26px identity avatar, same control
 * row - so a post swapping in over its own placeholder doesn't move anything. */
export function PostCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/55 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-[26px] w-[26px] shrink-0 rounded-full" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-10" />
      </div>
      <Skeleton className="mt-2.5 h-3.5 w-full" />
      <Skeleton className="mt-1.5 h-3.5 w-4/5" />
      <div className="mt-2.5 flex items-center gap-1.5">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
    </div>
  );
}
