import { Skeleton } from "@/components/ui/Skeleton";

/** A section as the race page draws it: the eyebrow over a hairline, then its content. */
function SectionSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-12">
      <Skeleton shape="block" className="h-3 w-40" />
      <div className="mt-3 border-t border-white/[0.06] pt-4">{children}</div>
    </div>
  );
}

/**
 * The race page's shape while it loads, for an upcoming race and a finished one alike (the loader can't know which):
 * the hero card (breadcrumb, title, meta line, the key fact on the right, the figures strip), then the first section
 * (a one-line summary over a ten-row table) and the next section's panel. Same container and spacing as
 * race/page.tsx, so nothing jumps when the real page replaces it.
 */
export default function RaceLoading() {
  return (
    <div role="status" className="page-wide skeleton-delay py-8">
      <span className="sr-only">Loading the race</span>

      <div className="rounded-overlay bg-surface-1">
        <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <Skeleton shape="block" className="h-4 w-36" />
            <Skeleton shape="block" className="mt-4 h-9 w-full max-w-sm" />
            <Skeleton shape="block" className="mt-3 h-4 w-full max-w-md" />
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <Skeleton shape="block" className="h-3 w-20" />
            <Skeleton shape="block" className="h-10 w-36" />
            <Skeleton shape="block" className="h-4 w-44" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/[0.08] px-5 py-5 sm:grid-cols-3 sm:px-8 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={i > 1 ? "hidden sm:block" : undefined}>
              <Skeleton shape="block" className="h-3 w-16" />
              <Skeleton shape="block" className="mt-2 h-4 w-28" />
            </div>
          ))}
        </div>
      </div>

      <SectionSkeleton>
        <Skeleton shape="block" className="h-4 w-full max-w-xl" />
        <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.06]">
          <Skeleton shape="block" className="h-9 w-full" />
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} shape="row" className="mt-px h-10" />
          ))}
        </div>
      </SectionSkeleton>

      <SectionSkeleton>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton shape="block" className="h-48" />
          <Skeleton shape="block" className="h-48" />
        </div>
      </SectionSkeleton>
    </div>
  );
}
