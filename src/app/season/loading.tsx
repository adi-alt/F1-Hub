import { SeasonCalendarHeatmapSkeleton } from "./components/SeasonCalendarHeatmapSkeleton";
import { StandingsTableSkeleton } from "./components/StandingsTableSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export default function SeasonLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
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
  );
}
