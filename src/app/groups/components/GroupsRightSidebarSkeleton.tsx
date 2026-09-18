import { Skeleton } from "@/components/ui/Skeleton";

/** Matches GroupsRightSidebar's real shape - four separately-sized widgets stacked, not one tall
 * card with dividers - so nothing reflows once real data swaps in. */
export function GroupsRightSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60">
        <Skeleton className="h-[72px] w-full rounded-none" />
        <div className="px-3 py-2.5">
          <Skeleton className="h-2 w-14" />
          <Skeleton className="mt-1 h-4 w-36" />
          <Skeleton className="mt-1 h-2.5 w-24" />
          <Skeleton className="mt-1.5 h-5 w-32 rounded-full" />
          <Skeleton className="mt-2 h-7 w-full rounded-lg" />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 px-3 py-2.5">
        <Skeleton className="h-2 w-24" />
        <div className="mt-2 space-y-2.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-1 h-2.5 w-40" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="h-11 w-full rounded-xl" />

      <div className="rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 px-3 py-2.5">
        <Skeleton className="h-2 w-24" />
        <div className="mt-2 space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
