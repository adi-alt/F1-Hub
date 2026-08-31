import { Skeleton } from "@/components/ui/Skeleton";

/** Shared by /season/loading.tsx and /archive/loading.tsx's ?year= branch - both routes render
 * the exact same SeasonDetail component, so they get the exact same loading shape too, not two
 * skeletons that have to be kept in sync by hand. */
export function SeasonDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="mb-8">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="mt-3 h-4 w-56" />
      </div>

      <div className="mb-4 flex items-end justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-48 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none border-t border-[var(--f1-line)]" />
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08]">
        <Skeleton className="h-12 w-full rounded-none" />
        <div className="p-5">
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>

      <div className="mt-8">
        <Skeleton className="mb-4 h-3 w-32" />
        <div className="flex gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-6 shrink-0 rounded-[5px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
