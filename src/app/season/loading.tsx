import { SeasonCalendarHeatmapSkeleton } from "./components/SeasonCalendarHeatmapSkeleton";
import { StandingsTableSkeleton } from "./components/StandingsTableSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

function RailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--f1-line)] p-4">
        <Skeleton className="mb-3 h-3 w-20" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="rounded-xl border border-[var(--f1-line)] p-4">
        <Skeleton className="mb-3 h-3 w-20" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export default function SeasonLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
      <div className="xl:grid xl:grid-cols-[260px_minmax(0,1fr)_260px] xl:items-start xl:gap-6">
        <aside className="hidden xl:block">
          <RailSkeleton />
        </aside>

        <div className="mx-auto w-full max-w-5xl">
          <Skeleton className="h-9 w-56" />

          <div className="mt-8 space-y-10">
            <div>
              <Skeleton className="mb-3 h-6 w-64" />
              <StandingsTableSkeleton hasTeamColumn />
            </div>
            <div>
              <Skeleton className="mb-3 h-6 w-72" />
              <StandingsTableSkeleton hasTeamColumn={false} avatarShape="square" />
            </div>
          </div>

          <div className="mt-10">
            <Skeleton className="mb-3 h-6 w-40" />
            <SeasonCalendarHeatmapSkeleton />
          </div>
        </div>

        <aside className="hidden xl:block">
          <RailSkeleton />
        </aside>
      </div>
    </div>
  );
}
