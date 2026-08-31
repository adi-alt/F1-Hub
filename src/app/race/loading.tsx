import { Skeleton } from "@/components/ui/Skeleton";

export default function RaceLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-3 w-20" />
      <Skeleton className="mt-2 h-9 w-72" />
      <Skeleton className="mt-2 h-4 w-56" />

      <div className="mt-8 flex gap-6 border-b border-white/[0.08] pb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <Skeleton className="h-9 w-full rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none border-t border-[var(--f1-line)]" />
        ))}
      </div>
    </div>
  );
}
