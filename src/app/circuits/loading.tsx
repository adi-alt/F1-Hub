import { Skeleton } from "@/components/ui/Skeleton";
import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";

export default function CircuitsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SectionLoadingMessage label="Mapping the circuits…" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
