import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

/** The race-photos review's shape while it loads: the header, the race list beside the approved
 * photos and the candidate groups, at the page's own grid and spacing. */
export default function RacePhotosLoading() {
  return (
    <SkeletonGroup label="Loading race photos" className="page-wide py-8">
      <Skeleton shape="block" className="h-9 w-48" />
      <Skeleton className="mt-3 max-w-2xl" />
      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="space-y-1">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} shape="row" className="h-9" />
          ))}
        </div>
        <div className="space-y-12">
          <Skeleton className="w-40" />
          <div>
            <Skeleton shape="block" className="h-6 w-56" />
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} shape="block" className="aspect-[4/3]" />
              ))}
            </div>
          </div>
          <div>
            <Skeleton shape="block" className="h-6 w-32" />
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} shape="block" className="h-64" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}
