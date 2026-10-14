import { Skeleton } from "@/components/ui/Skeleton";

/** The Communities home's outline while it loads, section for section: header, this weekend (the race and two
 * rounds), your communities as cards, then the conversation beside the pulse. */
export function GroupsHomeSkeleton() {
  return (
    <div>
      <Skeleton shape="block" className="h-10 w-64" />
      <Skeleton shape="text" className="mt-3 w-96 max-w-full" />
      <Skeleton shape="block" className="mt-12 h-7 w-44" />
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Skeleton shape="block" className="h-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton shape="block" className="h-48" />
          <Skeleton shape="block" className="h-48" />
        </div>
      </div>
      <Skeleton shape="block" className="mt-12 h-7 w-52" />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} shape="block" className="h-64" />
        ))}
      </div>
      <Skeleton shape="block" className="mt-12 h-7 w-56" />
      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shape="block" className="h-36" />
          ))}
        </div>
        <Skeleton shape="block" className="h-72" />
      </div>
    </div>
  );
}
