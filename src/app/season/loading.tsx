import { Skeleton } from "@/components/ui/Skeleton";

export default function SeasonLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-9 w-40 rounded-full" />
        <Skeleton className="h-9 w-52 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none border-t border-[var(--f1-line)]" />
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <Skeleton className="h-11 w-full rounded-none" />
        <div className="p-4">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>

      <div className="mt-6">
        <Skeleton className="mb-2 h-3 w-32" />
        <div className="flex gap-1.5">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 shrink-0 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
