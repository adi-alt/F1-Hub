import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";
import { InsightSkeleton, LoadingRegion, MediaSkeleton, MetricSkeleton, TextSkeleton } from "@/components/ui/Skeletons";

// Shared by both branches this route can render (the Explorer homepage and an individual circuit
// page) - Next shows this while the async Server Component is still resolving either shape, so it
// can't be perfectly tailored to one. Matching the real page's own max-w-[1200px] container is what
// actually matters here: the old max-w-5xl skeleton reflowed the instant real content replaced it.
export default function CircuitsLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <SectionLoadingMessage label="Mapping the circuits…" />
      <LoadingRegion label="Loading circuits">
        <TextSkeleton width={220} height={38} />
        <TextSkeleton className="mt-3" width="60%" height={13} />
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricSkeleton key={i} />
          ))}
        </div>
        <div className="mt-8">
          <MediaSkeleton ratio="21 / 9" />
        </div>
        <div className="mt-8">
          <InsightSkeleton lines={2} />
        </div>
      </LoadingRegion>
    </div>
  );
}
