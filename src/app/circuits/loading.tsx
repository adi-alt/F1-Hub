import { Skeleton } from "@/components/ui/Skeleton";

// The circuits home's own outline (CircuitsHome): the title, the next race, then the calendar grid of cards.
export default function CircuitsLoading() {
  return (
    <div role="status" className="page-wide skeleton-delay py-8">
      <span className="sr-only">Loading circuits</span>
      <Skeleton shape="block" className="h-4 w-24" />
      <Skeleton shape="block" className="mt-2 h-10 w-48" />
      <Skeleton shape="block" className="mt-8 h-72 w-full rounded-card" />
      <Skeleton shape="block" className="mt-12 h-6 w-40" />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} shape="block" className="h-64 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
