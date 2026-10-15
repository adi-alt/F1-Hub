import { Skeleton } from "@/components/ui/Skeleton";

/** GroupsRightSidebar while the page loads: the race (photo, name, countdown), then the open rounds. */
export function GroupsRightSidebarSkeleton() {
  return (
    <div>
      <Skeleton shape="block" className="h-28 w-full rounded-card" />
      <Skeleton shape="block" className="mt-4 h-3.5 w-24" />
      <Skeleton shape="block" className="mt-2 h-6 w-56" />
      <Skeleton shape="block" className="mt-4 h-7 w-24" />
      <div className="mt-5 border-t border-white/[0.06] pt-5">
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
