import { ChampionshipTrajectory } from "./ChampionshipTrajectory";
import { SeasonStrip } from "./SeasonStrip";
import { chart } from "@/components/charts/chartTheme";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SeasonRecap as SeasonRecapData } from "@/lib/personalization";
import type { RaceDoc } from "@/lib/types/race";

/** "How the season is unfolding" - Tier 3 (editorial/data-viz, see the redesign plan's surface
 * hierarchy): narrative text and the trajectory chart are borderless editorial content (the same
 * accent-bar treatment used for the page's other editorial centerpiece), not wrapped in one large
 * bordered card the way every other section is - only `SeasonStrip`'s individual round cards below
 * keep containment, since those are the interactive/clickable element. */
export function SeasonRecap({
  year,
  races,
  recap,
  aiNarrative,
  nextRaceRound,
}: {
  year: number;
  races: RaceDoc[];
  recap: SeasonRecapData;
  aiNarrative?: string | null;
  nextRaceRound?: number | null;
}) {
  if (recap.roundsCompleted === 0) {
    return (
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
            {year} Season So Far
          </h2>
          <p className="text-xs text-neutral-500">Season preparation</p>
        </div>
        <p className="mt-4 border-l-2 border-white/10 pl-5 text-sm text-neutral-400 sm:pl-6">
          The season hasn&apos;t started yet. Check back once the first race is completed.
          {aiNarrative && (
            <span className="mt-2 block text-xs text-neutral-300">
              <span className="font-semibold text-white">Season Outlook: </span>{aiNarrative}
            </span>
          )}
        </p>
        <div className="mt-4">
          <SeasonStrip races={races} nextRaceRound={nextRaceRound} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
          {year} Season So Far
        </h2>
        <p className="text-xs text-neutral-500">
          Round {recap.roundsCompleted} of {recap.totalRounds}
        </p>
      </div>

      <div className="mt-4 grid gap-6 border-l-2 border-white/10 pl-5 sm:grid-cols-2 sm:pl-6">
        <div className="space-y-3 text-sm">
          {recap.driverLeader && (
            <p className="text-neutral-300">
              <span className="font-semibold text-white">{recap.driverLeader.driverName}</span> leads the drivers&apos; championship with{" "}
              {recap.driverLeader.points} points
              {recap.driverGapToSecond != null && recap.driverGapToSecond > 0 && <>, a {recap.driverGapToSecond}-point gap to P2</>}
              {recap.driverGapToSecond === 0 && <>, tied on points with P2</>}.
            </p>
          )}
          {recap.teamLeader && (
            <p className="text-neutral-300">
              <span className="font-semibold text-white">{recap.teamLeader.team}</span> tops the constructors&apos; standings with {recap.teamLeader.points}{" "}
              points
              {recap.teamGapToSecond != null && recap.teamGapToSecond > 0 && <> ({recap.teamGapToSecond} clear of P2)</>}.
            </p>
          )}
          {recap.mostWins && (
            <p className="text-neutral-400">
              <span className="font-medium text-white">{recap.mostWins.driverName}</span> has the most race wins this season ({recap.mostWins.wins}).
            </p>
          )}
          {recap.mostPodiums && recap.mostPodiums.driver !== recap.mostWins?.driver && (
            <p className="text-neutral-400">
              <span className="font-medium text-white">{recap.mostPodiums.driverName}</span> has the most podiums ({recap.mostPodiums.podiums}).
            </p>
          )}
          {recap.favoriteDriverRank != null && (
            <p className="text-neutral-400">
              Your favorite sits P{recap.favoriteDriverRank} in the championship.
            </p>
          )}

          {aiNarrative && (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  AI Season Narrative
                </span>
              </div>
              <p className="text-xs leading-relaxed text-neutral-300">{aiNarrative}</p>
            </div>
          )}
        </div>

        {recap.driverLeader && (
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Championship leader&apos;s trajectory</p>
            <ChampionshipTrajectory
              races={races}
              series={[{ code: recap.driverLeader.driver, label: recap.driverLeader.driverName, color: chart.sequentialBlue }]}
            />
          </div>
        )}
      </div>

      <div className="mt-6">
        <SeasonStrip races={races} nextRaceRound={nextRaceRound} />
      </div>
    </div>
  );
}

export function SeasonRecapSkeleton() {
  return (
    <div>
      <Skeleton className="skeleton-shimmer h-4 w-40 rounded" />
      <div className="mt-4 grid gap-6 border-l-2 border-white/10 pl-5 sm:grid-cols-2 sm:pl-6">
        <div className="space-y-2">
          <Skeleton className="skeleton-shimmer h-4 w-full rounded" />
          <Skeleton className="skeleton-shimmer h-4 w-5/6 rounded" />
          <Skeleton className="skeleton-shimmer h-4 w-2/3 rounded" />
        </div>
        <Skeleton className="skeleton-shimmer h-24 w-full rounded" />
      </div>
    </div>
  );
}
