"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
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
  const { intelligence, isLoading } = useHomepageIntelligence();
  const outlook = favoriteDriver && intelligence?.personalOutlook?.driver === favoriteDriver.name ? intelligence.personalOutlook : null;
  // A favorite driver is the ONLY thing that makes an outlook block possible at all (see the
  // match check above) - so it's the one thing we know synchronously, before the AI fetch
  // resolves, that tells us whether to reserve space for it. This is what was missing before:
  // the block simply didn't exist until `outlook` became truthy, so the panel's real height
  // (and the AI text arriving) came as a sudden, un-animated append with nothing reserved for it.
  const expectsOutlook = !!favoriteDriver;

  if (!trackHistory) {
    return (
      <div className="flex h-full items-center rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/30 p-5 backdrop-blur-md sm:p-6">
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
    <motion.div
      layout="size"
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/30 p-5 backdrop-blur-md sm:p-6"
    >
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
        <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-mono text-neutral-400">
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

      {/* "Your favorites at this track" - every favorite (driver or team) with real appearances
       * here, not just the primary. getTrackHistory's list fields already only contain entities
       * with appearances > 0 (see personalization.ts), so no separate "has data" check is needed -
       * the whole block simply doesn't render when the combined list is empty. Compact rows,
       * matching the shared homepage density convention (lib/density.ts) - this block never
       * reaches "4+" in practice (favorites are capped elsewhere), so it always uses the same
       * tight stacked-row treatment. */}
      {(trackHistory.favoriteDriverCircuitStatsList.length > 0 || trackHistory.favoriteTeamCircuitStatsList.length > 0) && (
        <div className="mt-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-xs text-neutral-300">
          <p className="font-medium text-white">Your favorites at this track</p>
          <div className="mt-1 space-y-0.5">
            {trackHistory.favoriteDriverCircuitStatsList.map((s) => (
              <p key={s.driverId} className="text-[11px] text-neutral-400">
                <span className="font-medium text-neutral-200">{s.driverName}</span> ·{" "}
                {s.wins > 0
                  ? `${s.wins} win${s.wins === 1 ? "" : "s"} here`
                  : s.podiums > 0
                    ? `${s.podiums} podium${s.podiums === 1 ? "" : "s"} here`
                    : `best P${s.bestFinish ?? "N/A"} in ${s.appearances} start${s.appearances === 1 ? "" : "s"}`}
              </p>
            ))}
            {trackHistory.favoriteTeamCircuitStatsList.map((s) => (
              <p key={s.teamId} className="text-[11px] text-neutral-400">
                <span className="font-medium text-neutral-200">{s.teamName}</span> ·{" "}
                {s.wins > 0
                  ? `${s.wins} win${s.wins === 1 ? "" : "s"} here`
                  : s.podiums > 0
                    ? `${s.podiums} podium${s.podiums === 1 ? "" : "s"} here`
                    : `best P${s.bestFinish ?? "N/A"} in ${s.appearances} start${s.appearances === 1 ? "" : "s"}`}
              </p>
            ))}
          </div>
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

      {/* Reserves the block the instant we know a favorite driver exists (before the AI fetch even
       * resolves) - the real fix for the "outlook suddenly appears and the panel jumps" bug: there
       * used to be nothing here at all until `outlook` went truthy, so both the text AND its own
       * vertical space arrived at once, with no transition. Collapses cleanly to nothing if the AI
       * never ends up producing a matching outlook (a guest, or a fallback that omitted it) -
       * `layout="size"` on the outer panel animates that height change too, so even the "it wasn't
       * needed after all" case doesn't jump. */}
      {expectsOutlook && isLoading && (
        <div className="mt-3.5 border-t border-white/[0.06] pt-3">
          <Skeleton className="skeleton-shimmer h-2.5 w-24 rounded" />
          <div className="mt-2 space-y-1.5">
            <Skeleton className="skeleton-shimmer h-3 w-full rounded" />
            <Skeleton className="skeleton-shimmer h-3 w-full rounded" />
            <Skeleton className="skeleton-shimmer h-3 w-2/3 rounded" />
          </div>
        </div>
      )}
      {outlook && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mt-3.5 border-t border-white/[0.06] pt-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--f1-red)]">Your outlook</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-300">{outlook.overallAssessment}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

export function RaceIntelligencePanelSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/30 p-5 backdrop-blur-md sm:p-6">
      <Skeleton className="skeleton-shimmer h-12 w-full rounded-lg mb-3 opacity-40" />
      <div className="flex items-center justify-between">
        <Skeleton className="skeleton-shimmer h-3 w-28 rounded" />
        <Skeleton className="skeleton-shimmer h-3 w-12 rounded-md" />
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
