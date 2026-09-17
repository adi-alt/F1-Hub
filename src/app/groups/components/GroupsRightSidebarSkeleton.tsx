import { Skeleton } from "@/components/ui/Skeleton";

/** Matches GroupsRightSidebar's real shape - one card, race-weekend header then predictions then
 * the explore row - instead of generic blocks, so nothing reflows once real data swaps in. */
export function GroupsRightSidebarSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60">
      <div className="px-4 pb-4 pt-4">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="mt-3 h-2.5 w-16" />
        <Skeleton className="mt-2 h-5 w-44" />
        <Skeleton className="mt-2 h-3 w-28" />
        <Skeleton className="mt-2.5 h-6 w-40 rounded-full" />
        <Skeleton className="mt-3.5 h-10 w-full rounded-xl" />
      </div>
      <div className="border-t border-white/[0.06] px-4 py-4">
        <Skeleton className="h-2.5 w-32" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="mt-1.5 h-2.5 w-44" />
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/[0.06] p-4">
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}
