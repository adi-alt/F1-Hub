import { Skeleton } from "@/components/ui/Skeleton";

export default function RaceLoading() {
  return (
    <div role="status" className="page-content skeleton-delay py-10">
      <span className="sr-only">Loading the simulation</span>
      <Skeleton shape="block" className="h-4 w-24" />
      <div className="mt-2 flex items-center justify-between">
        <div>
          <Skeleton shape="block" className="h-3 w-20" />
          <Skeleton shape="block" className="mt-2 h-8 w-64" />
        </div>
        <Skeleton shape="circle" className="h-9 w-32" />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} shape="block" className="h-20" />
        ))}
      </div>

      <Skeleton shape="block" className="mt-8 h-96 w-full" />
    </div>
  );
}
