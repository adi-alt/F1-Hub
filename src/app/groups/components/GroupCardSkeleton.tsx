import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors GroupCardShell's exact shape (aspect-[4/1] banner, -mt-6 icon overlap, name +
 * description + stats + activity + footer lines) so the grid doesn't reflow when real cards swap
 * in. */
export function GroupCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60">
      <Skeleton className="aspect-[4/1] w-full rounded-none" />
      <div className="px-4 pb-4">
        <div className="-mt-6 flex items-end justify-between">
          <Skeleton className="h-12 w-12 rounded-full ring-4 ring-[var(--f1-carbon)]" />
          <Skeleton className="mb-1 h-3 w-10" />
        </div>
        <Skeleton className="mt-3 h-4 w-2/3" />
        <Skeleton className="mt-2 h-3 w-4/5" />
        <Skeleton className="mt-3 h-3 w-1/3" />
        <Skeleton className="mt-2.5 h-3 w-2/5" />
        <Skeleton className="mt-3 h-8 w-full" />
      </div>
    </div>
  );
}
