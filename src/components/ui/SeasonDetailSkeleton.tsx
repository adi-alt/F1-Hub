import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";
import { InsightSkeleton, LoadingRegion, MetricSkeleton, TextSkeleton } from "@/components/ui/Skeletons";

/** Shared by /season/loading.tsx and /archive/loading.tsx's ?year= branch — both routes render
 * the exact same SeasonDetail component, so they get the exact same loading shape too, not two
 * skeletons that have to be kept in sync by hand.
 *
 * Rebuilt to mirror the current layout section for section (masthead, Apex take, snapshot strip,
 * the standings/what-changed row, the analysis workspace, the calendar). A skeleton whose shape
 * doesn't match what replaces it is just a different kind of layout shift. */
export function SeasonDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <SectionLoadingMessage label="Pulling this season's telemetry…" />

      <LoadingRegion label="Loading the season">
        {/* Masthead */}
        <div className="mb-8">
          <TextSkeleton width={160} height={46} />
          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.07]" />
            <TextSkeleton width={150} height={10} />
          </div>
        </div>

        {/* Apex season take */}
        <InsightSkeleton className="mb-9 max-w-3xl" lines={3} />

        {/* Snapshot strip */}
        <div className="mb-9">
          <TextSkeleton width={110} height={9} />
          <div className="mt-2 h-px w-full bg-white/[0.06]" />
          <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <MetricSkeleton key={i} />
            ))}
          </div>
        </div>

        {/* Standings + what changed. Mirrors the real row exactly, including its declared height,
            so the two columns don't resize the moment content arrives. */}
        <div className="mb-8 grid grid-cols-1 items-stretch gap-8 lg:h-[34rem] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-10">
          <div className="flex min-h-0 min-w-0 flex-col">
            <TextSkeleton width={96} height={9} />
            <TextSkeleton className="mt-3" width={190} height={16} />
            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/[0.07]">
              <div className="skeleton-shimmer h-10 w-full shrink-0 bg-white/[0.04]" />
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton-shimmer h-[52px] w-full shrink-0 border-t border-white/[0.055] bg-white/[0.025]" />
              ))}
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-col">
            <TextSkeleton width={96} height={9} />
            <div className="mt-2 h-px w-full bg-white/[0.06]" />
            <TextSkeleton className="mt-2.5" width={150} height={9} />
            <TextSkeleton className="mt-3" width="84%" height={11} />
            {/* Rows carry a sparkline-sized block, because the real ones do. */}
            <div className="mt-3 min-h-0 flex-1 divide-y divide-white/[0.055]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <TextSkeleton width={`${58 + ((i * 11) % 26)}%`} height={11} />
                    <TextSkeleton width="34%" height={8} />
                  </div>
                  <TextSkeleton width={68} height={22} />
                  <TextSkeleton width={26} height={12} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Analysis workspace */}
        <div className="mb-8 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.012]">
          <div className="flex items-center gap-6 px-5 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <TextSkeleton key={i} width={i === 0 ? 52 : 74} height={11} />
            ))}
          </div>
          <div className="border-t border-white/[0.06] p-5">
            <div className="skeleton-shimmer h-[240px] w-full rounded-md bg-white/[0.03]" />
          </div>
        </div>

        {/* Calendar */}
        <div>
          <TextSkeleton width={112} height={9} />
          <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.012] p-5">
            <div className="skeleton-shimmer h-[150px] w-full rounded-md bg-white/[0.03]" />
          </div>
        </div>
      </LoadingRegion>
    </div>
  );
}
