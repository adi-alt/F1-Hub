import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";
import { InsightSkeleton, LoadingRegion, MediaSkeleton, TextSkeleton } from "@/components/ui/Skeletons";

// Shared by both branches this route can render (the Explorer homepage and an individual circuit
// page) - Next shows this while the async Server Component is still resolving either shape, so it
// can't be perfectly tailored to one. Matching the real page's own max-w-[1400px] container and
// the explorer's own compact, single-viewport shape (a header, a wrapping row of small round
// chips, a next-race band) is what keeps this from reflowing the instant real content replaces it
// - the old grid-of-MetricSkeletons/big-hero-media shape belonged to the vertical timeline this
// page no longer renders (see SeasonJourney.tsx).
export default function CircuitsLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <SectionLoadingMessage label="Mapping the circuits…" />
      <LoadingRegion label="Loading circuits">
        <TextSkeleton width={200} height={30} />
        <TextSkeleton className="mt-3" width="40%" height={12} />
        <div className="mt-6 flex flex-wrap gap-3">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="flex w-16 flex-col items-center gap-1.5">
              <TextSkeleton width={44} height={44} />
              <TextSkeleton width={28} height={10} />
            </div>
          ))}
        </div>
        <div className="mt-6">
          <MediaSkeleton ratio="21 / 5" />
        </div>
        <div className="mt-8">
          <InsightSkeleton lines={2} />
        </div>
      </LoadingRegion>
    </div>
  );
}
