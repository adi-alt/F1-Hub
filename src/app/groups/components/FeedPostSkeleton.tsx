import { Skeleton } from "@/components/ui/Skeleton";

export function FeedPostSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-[18px] w-[18px] rounded-full" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="mt-3 h-4 w-4/5" />
      <Skeleton className="mt-2 h-4 w-3/5" />
      <div className="mt-3 flex items-center gap-4">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}
