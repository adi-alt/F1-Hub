import { Skeleton } from "@/components/ui/Skeleton";

const WIDGET = "overflow-hidden rounded-card surface-frost";

/** GroupsRightSidebar's widgets while the page loads: the race (photo, name, countdown), Apex, the open rounds. */
export function GroupsRightSidebarSkeleton() {
  return (
    <div className="space-y-3">
      <div className={WIDGET}>
        <Skeleton shape="block" className="h-28 w-full rounded-none" />
        <div className="p-4">
          <Skeleton shape="block" className="h-3.5 w-24" />
          <Skeleton shape="block" className="mt-2 h-6 w-56" />
          <Skeleton shape="block" className="mt-4 h-7 w-24" />
        </div>
      </div>
      <div className={`${WIDGET} p-4`}>
        <Skeleton shape="block" className="h-4 w-20" />
        <Skeleton shape="block" className="mt-3 h-3.5 w-full" />
        <Skeleton shape="block" className="mt-2 h-3.5 w-4/5" />
      </div>
      <div className={`${WIDGET} p-4`}>
        <Skeleton shape="block" className="h-4 w-28" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="mt-4">
            <Skeleton shape="block" className="h-3.5 w-32" />
            <Skeleton shape="block" className="mt-1.5 h-3 w-44" />
          </div>
        ))}
      </div>
    </div>
  );
}
