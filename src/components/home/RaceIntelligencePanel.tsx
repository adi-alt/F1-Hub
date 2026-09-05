import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FavoriteDriverCard, FavoriteTeamCard, TrackHistory } from "@/lib/personalization";

/** The Hero's right-side column — "what the data says about this exact circuit," real numbers
 * only (see personalization.ts's getTrackHistory: totalRaces/firstYear-lastYear/topPerformer/
 * topCurrentTeam/youngestWinner/defendingWinner, nothing this widget invents on top). No track
 * outline/geometry here on purpose: archive_circuits has no coordinate or layout data at all (see
 * supabase/schema.sql), and drawing a fake circuit shape or fake driver positions would violate
 * the "never invent physical geometry" constraint this redesign was built under — a stat panel
 * earns its place on real derived numbers instead of a decorative track diagram. */
export function RaceIntelligencePanel({
  circuitName,
  trackHistory,
  favoriteDriver,
  favoriteTeam,
}: {
  circuitName: string;
  trackHistory: TrackHistory | null;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
}) {
  if (!trackHistory) {
    return (
      <div className="flex h-full items-center rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5">
        <p className="text-sm text-neutral-500">No archive history yet for {circuitName}, this looks like a new addition to the calendar.</p>
      </div>
    );
  }

  const favoriteHereDriver = favoriteDriver && trackHistory.topPerformer?.driverId === favoriteDriver.driverId ? trackHistory.topPerformer : null;
  const favoriteHereTeam = favoriteTeam && trackHistory.topCurrentTeam?.name === favoriteTeam.currentName ? trackHistory.topCurrentTeam : null;

  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Track intelligence</p>
      <p className="mt-1 text-sm text-neutral-400">
        {trackHistory.totalRaces} race{trackHistory.totalRaces === 1 ? "" : "s"} on record, {trackHistory.firstYear}-{trackHistory.lastYear}
      </p>

      <div className="mt-4 space-y-3.5">
        {trackHistory.topPerformer && (
          <Link href={trackHistory.topPerformer.href} className="flex items-center gap-3 transition hover:opacity-90">
            <EntityAvatar imageUrl={trackHistory.topPerformer.photoUrl} name={trackHistory.topPerformer.driverName} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{trackHistory.topPerformer.driverName}</p>
              <p className="text-xs text-neutral-500">Most wins here ({trackHistory.topPerformer.wins})</p>
            </div>
          </Link>
        )}

        {trackHistory.defendingWinner && (
          <Link href={trackHistory.defendingWinner.href} className="flex items-center gap-3 transition hover:opacity-90">
            <EntityAvatar imageUrl={trackHistory.defendingWinner.photoUrl} name={trackHistory.defendingWinner.driverName} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{trackHistory.defendingWinner.driverName}</p>
              <p className="text-xs text-neutral-500">Defending winner ({trackHistory.defendingWinner.year})</p>
            </div>
          </Link>
        )}

        {trackHistory.topCurrentTeam && (
          <div className="flex items-center gap-3">
            <EntityAvatar imageUrl={trackHistory.topCurrentTeam.logoUrl} name={trackHistory.topCurrentTeam.name} size={32} fit="contain" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{trackHistory.topCurrentTeam.name}</p>
              <p className="text-xs text-neutral-500">Most successful team on the grid here ({trackHistory.topCurrentTeam.wins})</p>
            </div>
          </div>
        )}

        {trackHistory.youngestWinner && (
          <Link href={trackHistory.youngestWinner.href} className="flex items-center gap-3 transition hover:opacity-90">
            <EntityAvatar imageUrl={trackHistory.youngestWinner.photoUrl} name={trackHistory.youngestWinner.driverName} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{trackHistory.youngestWinner.driverName}</p>
              <p className="text-xs text-neutral-500">
                Youngest winner ({trackHistory.youngestWinner.ageYears}, {trackHistory.youngestWinner.year})
              </p>
            </div>
          </Link>
        )}
      </div>

      {(favoriteHereDriver || favoriteHereTeam) && (
        <div className="mt-4 rounded-xl border border-[var(--f1-red)]/25 bg-[var(--f1-red)]/[0.06] px-3.5 py-2.5">
          <p className="text-xs text-neutral-200">
            {favoriteHereDriver && (
              <>
                🎉 <span className="font-semibold text-white">{favoriteHereDriver.driverName}</span> is your favorite and the winningest driver here.
              </>
            )}
            {favoriteHereTeam && (
              <>
                🎉 <span className="font-semibold text-white">{favoriteHereTeam.name}</span> is your favorite and the most successful team here.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export function RaceIntelligencePanelSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5">
      <Skeleton className="skeleton-shimmer h-3 w-32 rounded" />
      <Skeleton className="skeleton-shimmer mt-2 h-3 w-40 rounded" />
      <div className="mt-4 space-y-3.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="skeleton-shimmer h-8 w-8 rounded-full" />
            <Skeleton className="skeleton-shimmer h-3 w-36 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
