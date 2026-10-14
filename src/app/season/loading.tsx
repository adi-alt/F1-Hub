import { SeasonDetailSkeleton } from "@/components/ui/SeasonDetailSkeleton";

export default function SeasonLoading() {
  // Shown only after 300ms (skeleton-delay): a fast answer - the sign-in gate, a cached season - never flashes it.
  return (
    <div className="skeleton-delay">
      <SeasonDetailSkeleton />
    </div>
  );
}
