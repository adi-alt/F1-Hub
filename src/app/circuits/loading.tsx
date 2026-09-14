import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";
import { InsightSkeleton, LoadingRegion, MediaSkeleton, TextSkeleton } from "@/components/ui/Skeletons";

// Shared by both branches this route can render (the Explorer homepage and an individual circuit
// page) - Next shows this while the async Server Component is still resolving either shape, so it
// can't be perfectly tailored to one. Matches the real page's own max-w-[1400px] container, the
// season map's real (large) circuit-geometry chip size, and the focus panel's real three-column
// composition - the old thin single-band shape belonged to the earlier NextRaceFocus strip this
// page no longer renders (see CircuitsExplorer.tsx).
export default function CircuitsLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <SectionLoadingMessage label="Mapping the circuits…" />
      <LoadingRegion label="Loading circuits">
        <TextSkeleton width={200} height={30} />
        <TextSkeleton className="mt-3" width="40%" height={12} />
        <div className="mt-6 flex gap-2 overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex w-24 shrink-0 flex-col items-center gap-1.5">
              <TextSkeleton width={64} height={64} />
              <TextSkeleton width={36} height={10} />
            </div>
          ))}
        </div>
        <div className="mt-6">
          <MediaSkeleton ratio="21 / 8" />
        </div>
        <div className="mt-8">
          <InsightSkeleton lines={2} />
        </div>
      </LoadingRegion>
    </div>
  );
}
