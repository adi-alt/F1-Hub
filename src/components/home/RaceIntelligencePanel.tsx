"use client";

import Image from "next/image";
import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./ai/HomepageIntelligenceProvider";
import type { FavoriteDriverCard, FavoriteTeamCard, TrackHistory } from "@/lib/personalization";

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
  const { intelligence } = useHomepageIntelligence();
  const outlook = favoriteDriver && intelligence?.personalOutlook?.driver === favoriteDriver.name ? intelligence.personalOutlook : null;

  if (!trackHistory) {
    return (
      <div className="flex h-full items-center rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5">
        <p className="text-sm text-neutral-500">No archive history yet for {circuitName}, this looks like a new addition to the calendar.</p>
      </div>
    );
  }

  const favoriteHereDriver =
    favoriteDriver && trackHistory.topPerformer?.driverId === favoriteDriver.driverId
      ? trackHistory.topPerformer
      : null;
  const favoriteHereTeam =
    favoriteTeam && trackHistory.topCurrentTeam?.name === favoriteTeam.currentName
      ? trackHistory.topCurrentTeam
      : null;

  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5">
      {trackHistory.circuitImageUrl && (
        <div className="mb-3 flex justify-center border-b border-white/[0.06] pb-3">
          <Image
            src={trackHistory.circuitImageUrl}
            alt={circuitName}
            width={160}
            height={56}
            className="h-14 w-auto max-w-full object-contain opacity-75 transition hover:opacity-100"
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Track intelligence</p>
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-mono text-neutral-400">
          {trackHistory.totalRaces} GP{trackHistory.totalRaces === 1 ? "" : "s"}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-neutral-400">
        Record spanning {trackHistory.firstYear}–{trackHistory.lastYear}
      </p>

      <div className="mt-3.5 space-y-3">
        {trackHistory.topPerformer && (
          <Link href={trackHistory.topPerformer.href} className="flex items-center gap-3 transition hover:opacity-90">
            <EntityAvatar imageUrl={trackHistory.topPerformer.photoUrl} name={trackHistory.topPerformer.driverName} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{trackHistory.topPerformer.driverName}</p>
              <p className="text-xs text-neutral-500">Most wins here ({trackHistory.topPerformer.wins})</p>
            </div>
          </Link>
        )}

        {trackHistory.topPodiumDriver && trackHistory.topPodiumDriver.driverId !== trackHistory.topPerformer?.driverId && (
          <Link href={trackHistory.topPodiumDriver.href} className="flex items-center gap-3 transition hover:opacity-90">
            <EntityAvatar imageUrl={trackHistory.topPodiumDriver.photoUrl} name={trackHistory.topPodiumDriver.driverName} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{trackHistory.topPodiumDriver.driverName}</p>
              <p className="text-xs text-neutral-500">Most podiums here ({trackHistory.topPodiumDriver.podiums})</p>
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
              <p className="text-xs text-neutral-500">Most team wins here ({trackHistory.topCurrentTeam.wins})</p>
            </div>
          </div>
        )}
      </div>

      {/* Driver/Team Circuit Record Callout */}
      {trackHistory.favoriteDriverCircuitStats && (
        <div className="mt-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-neutral-300">
          <p className="font-medium text-white">Your driver circuit record:</p>
          <p className="text-[11px] text-neutral-400">
            Best finish P{trackHistory.favoriteDriverCircuitStats.bestFinish ?? "N/A"}
            {trackHistory.favoriteDriverCircuitStats.avgFinish ? ` · Avg P${trackHistory.favoriteDriverCircuitStats.avgFinish.toFixed(1)}` : ""}
            {` · ${trackHistory.favoriteDriverCircuitStats.appearances} starts`}
          </p>
        </div>
      )}

      {(favoriteHereDriver || favoriteHereTeam) && (
        <div className="mt-3.5 rounded-xl border border-[var(--f1-red)]/25 bg-[var(--f1-red)]/[0.06] px-3.5 py-2">
          <p className="text-xs text-neutral-200">
            {favoriteHereDriver && (
              <>
                <span className="font-semibold text-white">{favoriteHereDriver.driverName}</span> is your favorite and holds the win record here.
              </>
            )}
            {favoriteHereTeam && (
              <>
                <span className="font-semibold text-white">{favoriteHereTeam.name}</span> is your favorite and the winningest constructor here.
              </>
            )}
          </p>
        </div>
      )}

      {outlook && (
        <div className="mt-3.5 border-t border-white/[0.06] pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--f1-red)]">Your outlook</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-300">{outlook.overallAssessment}</p>
        </div>
      )}
    </div>
  );
}

export function RaceIntelligencePanelSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5">
      <Skeleton className="skeleton-shimmer h-12 w-full rounded-lg mb-3 opacity-40" />
      <div className="flex items-center justify-between">
        <Skeleton className="skeleton-shimmer h-3 w-28 rounded" />
        <Skeleton className="skeleton-shimmer h-3 w-12 rounded-full" />
      </div>
      <Skeleton className="skeleton-shimmer mt-2 h-3 w-36 rounded" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="skeleton-shimmer h-8 w-8 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="skeleton-shimmer h-3 w-28 rounded" />
              <Skeleton className="skeleton-shimmer h-2.5 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
