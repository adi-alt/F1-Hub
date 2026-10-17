import { Skeleton } from "@/components/ui/Skeleton";

// The circuits home's own outline (CircuitsHome): the title, the next race, then the calendar grid of cards.
export function CircuitsHomeSkeleton() {
  return (
    <div role="status" className="page-wide skeleton-delay py-8">
      <span className="sr-only">Loading circuits</span>
      <Skeleton shape="block" className="h-4 w-24" />
      <Skeleton shape="block" className="mt-2 h-10 w-48" />
      <Skeleton shape="block" className="mt-8 h-72 w-full rounded-card" />
      <Skeleton shape="block" className="mt-12 h-6 w-40" />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} shape="block" className="h-64 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}

// The circuit page's own outline (CircuitDetailPage), as it is now: the breadcrumb, eyebrow, name, tags and next race
// beside the circuit's drawing; the figures in a hairline strip; then the sections in pairs (the race beside the track
// through time, Apex beside the records) under their eyebrows. Same container as the page (page-wide).
function SectionSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton shape="block" className="h-3 w-40" />
      <div className="mb-3 mt-2 h-px w-full bg-white/[0.06]" />
      <Skeleton shape="block" className="h-[22rem] w-full rounded-lg" />
    </div>
  );
}

export function CircuitDetailSkeleton() {
  return (
    <div role="status" className="page-wide skeleton-delay pb-12">
      <span className="sr-only">Loading the circuit</span>
      <div className="grid grid-cols-1 items-center gap-8 pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12 lg:pt-10">
        <div>
          <Skeleton shape="block" className="h-4 w-48" />
          <Skeleton shape="block" className="mt-4 h-3 w-64" />
          <Skeleton shape="block" className="mt-3 h-14 w-4/5" />
          <div className="mt-4 flex gap-1.5">
            {[96, 88, 72].map((w) => (
              <Skeleton key={w} shape="block" className="h-6" style={{ width: w }} />
            ))}
          </div>
          <Skeleton shape="block" className="mt-8 h-3 w-36" />
          <Skeleton shape="block" className="mt-2 h-9 w-72" />
          <Skeleton shape="block" className="mt-2 h-4 w-56" />
        </div>
        <Skeleton shape="block" className="aspect-[3/2] w-full max-h-[22rem] rounded-lg" />
      </div>
      <div className="mt-10 grid grid-cols-2 border-t border-white/[0.06] sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="py-3.5 pr-4 lg:px-5 lg:first:pl-0">
            <Skeleton shape="block" className="h-3 w-16" />
            <Skeleton shape="block" className="mt-2 h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-6">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
      <SectionSkeleton className="mt-12" />
    </div>
  );
}
