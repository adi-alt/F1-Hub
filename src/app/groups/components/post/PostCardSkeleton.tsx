import { Skeleton } from "@/components/ui/Skeleton";

export function PostCardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5">
      <div className="flex items-center gap-2">
        <Skeleton className="h-[18px] w-[18px] rounded-full" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="mt-2.5 h-4 w-3/5" />
      <Skeleton className="mt-2 h-3.5 w-full" />
      <Skeleton className="mt-1.5 h-3.5 w-4/5" />
      <div className="mt-3 flex items-center gap-4">
        <Skeleton className="h-5 w-8" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
