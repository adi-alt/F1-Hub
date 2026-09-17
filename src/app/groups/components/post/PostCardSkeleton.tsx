import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors PostCard's real default geometry - same card, same 36px identity avatar, same pill row -
 * so a post swapping in over its own placeholder doesn't move anything. */
export function PostCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 p-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-16 rounded-full" />
      </div>
    </div>
  );
}
