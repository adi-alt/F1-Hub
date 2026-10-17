import { Skeleton } from "@/components/ui/Skeleton";
import { PANEL } from "@/components/ui/panel";

/** Stand-ins for the parts of a driver's or team's page that stream in, each the shape of what replaces it, so the
 * page answers the click at once and nothing jumps as the real parts arrive. */
export function ArchiveEntityHeadSkeleton({ photo = true }: { photo?: boolean }) {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton shape="block" className="mb-6 h-4 w-40" />
      <div className="flex items-center gap-5">
        {photo && <Skeleton shape="circle" className="size-[76px]" />}
        <div className="flex-1">
          <Skeleton shape="block" className="h-3 w-64" />
          <Skeleton shape="block" className="mt-2.5 h-10 w-72" />
        </div>
      </div>
    </div>
  );
}

export function ArchiveEntityBodySkeleton() {
  return (
    <div role="status" aria-label="Loading the career">
      <Skeleton shape="block" className="mt-4 h-5 w-full max-w-2xl" />
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton shape="block" className="h-3 w-16" />
            <Skeleton shape="block" className="mt-2 h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton shape="block" className="h-80 w-full" />
        <ArchiveCircuitSkeleton />
      </div>
      <Skeleton shape="block" className="mt-10 h-[30rem] w-full" />
    </div>
  );
}

export function ArchiveCircuitSkeleton() {
  return (
    <div className={`flex h-72 flex-col p-5 ${PANEL}`}>
      <Skeleton shape="block" className="mx-auto w-3/4 flex-1" />
      <Skeleton shape="block" className="mt-4 h-4 w-40" />
    </div>
  );
}
