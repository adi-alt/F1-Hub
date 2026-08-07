import { Skeleton } from "@/components/ui/Skeleton";

export default function HomeLoading() {
  return (
    <>
      <div className="h-[78vh] min-h-[560px] w-full border-b border-[var(--f1-line)] bg-[var(--f1-carbon)]" />
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 min-w-[168px] rounded-xl" />
          ))}
        </div>
      </section>
    </>
  );
}
