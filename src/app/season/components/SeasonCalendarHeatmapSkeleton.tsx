import { Skeleton } from "@/components/ui/Skeleton";

const WEEKS = 53; // a full calendar year, same as the real grid (SeasonCalendarHeatmap.tsx)
const LEGEND_ITEMS = 6; // "No session" + the 5 real session categories

/** Mirrors SeasonCalendarHeatmap's real grid shape — same week-column/weekday-row cell sizing —
 * so the loading state reads as "the calendar is coming" rather than a generic gray block. */
export function SeasonCalendarHeatmapSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-end">
        <Skeleton className="h-7 w-7 rounded-full" />
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div className="ml-8 h-[10px]" />
          <div className="flex gap-[3px]">
            <div className="mr-2 w-6 shrink-0" />
            {Array.from({ length: WEEKS }).map((_, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {Array.from({ length: 7 }).map((_, di) => (
                  <Skeleton key={di} className="h-[13px] w-[13px] rounded-[3px]" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {Array.from({ length: LEGEND_ITEMS }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Skeleton className="h-[10px] w-[10px] rounded-[2px]" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
