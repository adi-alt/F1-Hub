import { Skeleton } from "@/components/ui/Skeleton";

export default function SeasonLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Skeleton className="h-9 w-56" />
      <div className="mt-8 space-y-10">
        <div>
          <Skeleton className="mb-3 h-6 w-64" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
        <div>
          <Skeleton className="mb-3 h-6 w-64" />
          <Skeleton className="h-60 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
