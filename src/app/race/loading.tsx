import { Skeleton } from "@/components/ui/Skeleton";
import { RaceStorySectionSkeleton } from "@/components/raceDetail/RaceStorySection";

// Same container as race/page.tsx's own real content (max-w/padding kept in sync by hand - the
// two aren't allowed to drift, since a mismatch here is exactly what makes the real content look
// like it "jumps wider" the instant it replaces this skeleton - not a general "content feels
// spread" complaint, a literal width discontinuity between this file and page.tsx).
export default function RaceLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-16">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-3 w-20" />
      <Skeleton className="mt-2 h-9 w-72" />
      <Skeleton className="mt-2 h-4 w-56" />

      <div className="mt-8 flex gap-6 border-b border-white/[0.08] pb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>

      <div className="mt-6">
        <RaceStorySectionSkeleton />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <Skeleton className="h-9 w-full rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none border-t border-[var(--f1-line)]" />
        ))}
      </div>
    </div>
  );
}
