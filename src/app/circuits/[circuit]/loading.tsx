import { Skeleton } from "@/components/ui/Skeleton";

// The circuit page's own outline (CircuitDetailPage): breadcrumb, name, the answer beside the circuit's figures,
// then the race story. Same container and spacing as the page (spec §9: the skeleton matches the final geometry).
export default function CircuitLoading() {
  return (
    <div role="status" className="page-content skeleton-delay py-8">
      <span className="sr-only">Loading the circuit</span>
      <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          <Skeleton shape="block" className="h-4 w-40" />
          <Skeleton shape="block" className="mt-3 h-14 w-4/5" />
          <Skeleton shape="block" className="mt-3 h-4 w-64" />
          <Skeleton shape="block" className="mt-8 h-3 w-40" />
          <Skeleton shape="block" className="mt-2 h-7 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:border-l lg:border-subtle lg:pl-12">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <Skeleton shape="block" className="h-3 w-16" />
              <Skeleton shape="block" className="mt-2 h-5 w-24" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton shape="block" className="h-6 w-64" />
      <Skeleton shape="block" className="mt-4 h-[28rem] w-full rounded-card" />
    </div>
  );
}
