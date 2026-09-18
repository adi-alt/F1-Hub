import { Skeleton } from "@/components/ui/Skeleton";

/** Matches GroupsRightSidebar's real shape and section order - one surface, race weekend, then
 * predictions, then pulse, then the explore row - instead of generic blocks, so nothing reflows
 * once real data swaps in. */
export function GroupsRightSidebarSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60">
      <div className="px-3 py-3">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="mt-2.5 h-2.5 w-14" />
        <Skeleton className="mt-1 h-4 w-40" />
        <Skeleton className="mt-1 h-2.5 w-24" />
        <Skeleton className="mt-2 h-5 w-36 rounded-full" />
        <Skeleton className="mt-2.5 h-8 w-full rounded-lg" />
      </div>
      <div className="border-t border-white/[0.06] px-3 py-3">
        <Skeleton className="h-2.5 w-28" />
        <div className="mt-1.5 space-y-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div className="border-t border-white/[0.06] px-3 py-3">
        <Skeleton className="h-2.5 w-28" />
        <div className="mt-2 space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-full" />
          ))}
        </div>
      </div>
      <div className="border-t border-white/[0.06] p-2.5">
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}
