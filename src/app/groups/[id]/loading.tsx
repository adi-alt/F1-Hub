import { Skeleton } from "@/components/ui/Skeleton";
import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";

// Real Suspense fallback for CommunityPage's own async fetches (group detail, posts, predictions,
// stats, pulse, next race). Mirrors the page's actual shape - cover, avatar/name block, tab strip
// and feed in the content column, four cards in the context rail - so the layout doesn't jump when
// the real thing arrives. "Feed" is the tab that lands by default, so that's the shape shown.
export default function CommunityDetailLoading() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <SectionLoadingMessage label="Loading community…" />
      <Skeleton className="h-4 w-36" />

      <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <Skeleton className="aspect-[7/1] w-full rounded-2xl sm:aspect-[8/1]" />

          <div className="-mt-8 px-1">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="mt-3 h-7 w-56" />
            <Skeleton className="mt-2 h-4 w-full max-w-lg" />
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-24 rounded-full" />
              ))}
            </div>
            <Skeleton className="mt-3 h-4 w-48" />
          </div>

          <div className="mt-6">
            <Skeleton className="h-10 w-full max-w-lg" />
            <div className="mt-5 space-y-3">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-9 w-full max-w-md rounded-full" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3 lg:mt-0">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
