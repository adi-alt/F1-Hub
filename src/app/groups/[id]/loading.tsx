import { Skeleton } from "@/components/ui/Skeleton";

// Real Suspense fallback for CommunityPage's own async fetches (group detail, posts, predictions,
// stats, pulse, next race). Mirrors the page's actual shape - cover, avatar/name block, tab strip
// and feed in the content column, four cards in the context rail - so the layout doesn't jump when
// the real thing arrives. "Feed" is the tab that lands by default, so that's the shape shown.
export default function CommunityDetailLoading() {
  return (
    <div role="status" className="page-wide skeleton-delay py-6">
      <span className="sr-only">Loading the community</span>
      <Skeleton shape="block" className="h-4 w-36" />

      <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <Skeleton shape="block" className="aspect-[7/1] w-full sm:aspect-[8/1]" />

          <div className="-mt-8 px-1">
            <Skeleton shape="circle" className="h-16 w-16" />
            <Skeleton shape="block" className="mt-3 h-7 w-56" />
            <Skeleton shape="block" className="mt-2 h-4 w-full max-w-lg" />
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} shape="circle" className="h-6 w-24" />
              ))}
            </div>
            <Skeleton shape="block" className="mt-3 h-4 w-48" />
          </div>

          <div className="mt-6">
            <Skeleton shape="block" className="h-10 w-full max-w-lg" />
            <div className="mt-5 space-y-3">
              <Skeleton shape="block" className="h-28 w-full" />
              <Skeleton shape="circle" className="h-9 w-full max-w-md" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} shape="block" className="h-32 w-full" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3 lg:mt-0">
          <Skeleton shape="block" className="h-56 w-full" />
          <Skeleton shape="block" className="h-24 w-full" />
          <Skeleton shape="block" className="h-64 w-full" />
          <Skeleton shape="block" className="h-44 w-full" />
        </div>
      </div>
    </div>
  );
}
