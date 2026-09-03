import { Skeleton } from "@/components/ui/Skeleton";
import { GroupCardSkeleton } from "./components/GroupCardSkeleton";

// Real Suspense fallback for GroupsPage's own async data fetch (getUserGroups) - matches its
// final layout exactly (header, tabs+search row, card grid) so there's no reflow on swap-in.
export default function GroupsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />

      <div className="mt-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-5 h-9 w-full max-w-sm" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <GroupCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
