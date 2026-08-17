import { Skeleton } from "@/components/ui/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl flex-col px-4 py-6 sm:px-6">
      <Skeleton className="h-9 w-64 shrink-0" />
      <Skeleton className="mt-2 h-4 w-full max-w-lg shrink-0" />
      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <Skeleton className="h-8 w-56 rounded-full" />
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <Skeleton className="h-9 w-full rounded-none" />
        <div className="space-y-0 p-0">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-none border-t border-[var(--f1-line)]/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
