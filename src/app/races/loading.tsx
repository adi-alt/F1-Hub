import { Skeleton } from "@/components/ui/LegacySkeleton";

export default function RaceLoading() {
  return (
    <div role="status" className="page-content skeleton-delay py-10">
      <span className="sr-only">Loading the simulation</span>
      <Skeleton className="h-4 w-24" />
      <div className="mt-2 flex items-center justify-between">
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-8 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      <Skeleton className="mt-8 h-96 w-full rounded-xl" />
    </div>
  );
}
