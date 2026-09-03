import { Skeleton } from "@/components/ui/Skeleton";
import { GroupCardSkeleton } from "./components/GroupCardSkeleton";

// Real Suspense fallback for GroupsPage's own async data fetch (getUserGroups) - matches its
// final layout exactly (header, tabs+toolbar row, card grid) so there's no reflow on swap-in.
export default function GroupsLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-16">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />

      <div className="mt-8">
        <Skeleton className="h-9 w-56" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="mt-5 h-3 w-64" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <GroupCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
