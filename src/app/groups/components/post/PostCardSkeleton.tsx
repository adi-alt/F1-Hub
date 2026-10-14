import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors PostCard's real geometry - same padding, same 34px identity avatar, the two-line header
 * a community post renders, and the same 28px control row - so a post swapping in over its own
 * placeholder doesn't move anything. */
export function PostCardSkeleton() {
  return (
    <div className="rounded-card border border-white/[0.08] bg-surface-1/70 p-4 sm:p-5">
      <div className="flex gap-3">
        <Skeleton shape="circle" className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton shape="block" className="mt-1 h-3.5 w-52" />
          <Skeleton shape="block" className="mt-3 h-4 w-3/4" />
          <Skeleton shape="block" className="mt-2 h-3.5 w-full" />
          <Skeleton shape="block" className="mt-1.5 h-3.5 w-4/5" />
          <div className="mt-3 flex items-center gap-1.5">
            <Skeleton shape="circle" className="h-8 w-24" />
            <Skeleton shape="circle" className="h-8 w-16" />
            <Skeleton shape="circle" className="h-8 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
