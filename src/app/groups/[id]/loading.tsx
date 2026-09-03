import { Skeleton } from "@/components/ui/Skeleton";

// Real Suspense fallback for GroupPage's own async fetches (group detail, leaderboard, posts,
// predictions). Mirrors the header (avatar, name, meta line) + tab strip + feed shell - "feed" is
// the tab that lands by default, so that's the shape shown.
export default function GroupDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Skeleton className="h-4 w-16" />

      <div className="mt-2 flex items-start gap-4">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
      </div>

      <div className="mt-8">
        <Skeleton className="h-9 w-full max-w-md" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
