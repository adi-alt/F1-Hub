import { Skeleton } from "@/components/ui/Skeleton";
import { GroupsRightSidebarSkeleton } from "./GroupsRightSidebarSkeleton";
import { PostCardSkeleton } from "./post/PostCardSkeleton";

/** GroupsHomeClient's shell while the page loads: the same columns, heights and card surfaces (40px community
 * rows, the composer's 36px avatar and toolbar), so nothing moves when the real page replaces it. */
export function GroupsHomeSkeleton() {
  return (
    <div className="py-4 lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-col gap-6 lg:grid lg:h-full lg:grid-cols-[248px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5 lg:overflow-hidden xl:grid-cols-[248px_minmax(0,1fr)_320px]">
        <div className="hidden lg:block">
          <div>
            <Skeleton shape="block" className="ml-2 mt-2.5 h-4 w-28" />
            <div className="mt-3 space-y-0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex h-10 items-center gap-2.5 px-1.5">
                  <Skeleton shape="circle" className="size-7 shrink-0" />
                  <Skeleton shape="block" className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-3 lg:overflow-hidden">
          <div className="border-b border-white/[0.06] pb-3 pt-1">
            <div className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-10 shrink-0" />
              <Skeleton shape="block" className="h-4 w-1/2" />
            </div>
            <div className="mt-2 flex items-center gap-2 pl-[3.25rem]">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} shape="circle" className="size-6" />
              ))}
              <Skeleton shape="block" className="ml-auto h-9 w-16 rounded-full" />
            </div>
          </div>
          <Skeleton shape="block" className="h-9 w-56" />
          <div className="divide-y divide-white/[0.06]">
            {Array.from({ length: 3 }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        </div>

        <div className="lg:hidden xl:block">
          <GroupsRightSidebarSkeleton />
        </div>
      </div>
    </div>
  );
}
