import { Skeleton } from "@/components/ui/Skeleton";

// The circuits home's own outline (CircuitsHome): the year, the round scrubber, then the circuit beside its story.
// Same container as the page, so nothing jumps when the real content replaces it.
export default function CircuitsLoading() {
  return (
    <div role="status" className="page-wide skeleton-delay py-8">
      <span className="sr-only">Loading circuits</span>
      <Skeleton shape="block" className="h-12 w-40" />
      <Skeleton shape="block" className="mt-6 h-16 w-full" />
      <div className="mt-8 grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <Skeleton shape="block" className="aspect-[4/3] w-full max-h-[24rem]" />
        <div>
          <Skeleton shape="block" className="h-3 w-32" />
          <Skeleton shape="block" className="mt-3 h-7 w-64" />
          <Skeleton shape="block" className="mt-6 h-5 w-3/4" />
          <Skeleton shape="block" className="mt-3 h-4 w-full" />
          <Skeleton shape="block" className="mt-2 h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
