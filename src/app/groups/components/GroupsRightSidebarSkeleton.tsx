import { Skeleton } from "@/components/ui/Skeleton";

const CARD = "overflow-hidden rounded-card border border-white/[0.08] bg-surface-1/70";

/** GroupsRightSidebar's widgets while the page loads: the race card, then the open rounds. */
export function GroupsRightSidebarSkeleton() {
  return (
    <div className="space-y-3">
      <div className={`${CARD} flex min-h-[8.5rem] flex-col justify-end p-4`}>
        <Skeleton shape="block" className="h-2.5 w-24" />
        <Skeleton shape="block" className="mt-2 h-4 w-44" />
        <Skeleton shape="block" className="mt-3 h-6 w-36 rounded-full" />
      </div>
      <div className={`${CARD} p-3`}>
        <Skeleton shape="block" className="ml-1 mt-2 h-3 w-24" />
        <div className="mt-3 space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} shape="block" className="h-[3.25rem] w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
