import { Skeleton } from "@/components/ui/Skeleton";

/** Matches GroupsRightSidebar's real two-card shape (Active Predictions rows, Next Race card)
 * instead of two generic blocks, so nothing reflows once real data swaps in. */
export function GroupsRightSidebarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5">
        <Skeleton className="h-3 w-28" />
        <div className="mt-2.5 space-y-2.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-[var(--f1-line)] bg-black/20 p-2.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-1.5 h-2.5 w-32" />
              <Skeleton className="mt-1.5 h-2.5 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-4 w-36" />
        <Skeleton className="mt-1.5 h-3 w-20" />
        <Skeleton className="mt-2.5 h-7 w-full rounded-lg" />
      </div>
    </div>
  );
}
