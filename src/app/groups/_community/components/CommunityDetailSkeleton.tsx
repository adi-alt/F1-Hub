import { Skeleton } from "@/components/ui/Skeleton";

// The stand-in while a community loads (the Communities page's Suspense fallback and its loading.tsx when the URL
// names a community), for CommunityView's own async fetches (group detail, posts, predictions,
// stats, pulse, next race). Mirrors the page's actual shape - the breadcrumb and menu, the avatar and
// name, the tab strip and feed in the content column, the rail's widgets beside it - so the layout
// doesn't jump when the real thing arrives. "Feed" is the tab that lands by default, so that's the shape shown.
export function CommunityDetailSkeleton() {
  return (
    <div role="status" className="page-wide skeleton-delay pb-10 pt-6 lg:pt-8">
      <span className="sr-only">Loading the community</span>
      <div className="flex items-center justify-between">
        <Skeleton shape="block" className="h-4 w-48" />
        <Skeleton shape="block" className="size-8" />
      </div>

      <div className="mt-6 flex items-end gap-4">
        <Skeleton shape="circle" className="size-16" />
        <div className="flex-1">
          <Skeleton shape="block" className="h-3 w-56" />
          <Skeleton shape="block" className="mt-2 h-8 w-64" />
        </div>
        <Skeleton shape="block" className="hidden h-8 w-24 sm:block" />
      </div>
      <Skeleton shape="block" className="mt-4 h-4 w-full max-w-2xl" />

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <Skeleton shape="block" className="h-10 w-full max-w-xs" />
          <div className="mt-5 space-y-3">
            <Skeleton shape="block" className="h-28 w-full" />
            <Skeleton shape="block" className="h-24 w-full" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} shape="block" className="h-32 w-full" />
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-3 lg:mt-0">
          <Skeleton shape="block" className="h-56 w-full" />
          <Skeleton shape="block" className="h-40 w-full" />
          <Skeleton shape="block" className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
