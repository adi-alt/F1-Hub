"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { DriverFormStrip, DriverFormStripSkeleton } from "./DriverFormStrip";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FavoriteDriverCard, FavoriteTeamCard } from "@/lib/personalization";
import type { RaceDoc } from "@/lib/types/race";
import { useAuth } from "@/providers/AuthProvider";

/** One cohesive section, not separate favorite-driver/favorite-team/stats cards — identity, form,
 * and the user's own numbers read as a single "who you are on F1 Hub" block. Points comes straight
 * from useAuth().pointsBalance (already live/reactive) rather than a redundant server fetch. */
export function YourF1({
  favoriteDriver,
  favoriteTeam,
  races,
  predictionCount,
}: {
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  races: RaceDoc[];
  predictionCount: number;
}) {
  const { pointsBalance } = useAuth();
  const hasFavorites = !!favoriteDriver || !!favoriteTeam;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">Your F1</h2>

      {!hasFavorites ? (
        <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-4">
          <p className="text-sm text-neutral-400">Choose a favorite driver and team to see them here.</p>
          <Link href="/profile?section=personalisation" className="mt-2 inline-block text-sm font-medium text-[var(--f1-red)] hover:brightness-125">
            Choose your favorites →
          </Link>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-6">
          {favoriteDriver ? (
            <Link href={favoriteDriver.href} className="flex items-center gap-3 transition hover:opacity-90">
              <EntityAvatar imageUrl={favoriteDriver.headshotUrl} name={favoriteDriver.name} size={48} />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">Your driver</p>
                <p className="font-semibold text-white">{favoriteDriver.name}</p>
                <p className="text-xs text-neutral-500">{favoriteDriver.team ?? "—"}</p>
              </div>
            </Link>
          ) : (
            <Link href="/profile?section=personalisation" className="text-sm font-medium text-neutral-400 hover:text-white">
              Choose your favorite driver →
            </Link>
          )}

          {favoriteTeam ? (
            <Link href={favoriteTeam.href} className="flex items-center gap-3 transition hover:opacity-90">
              <EntityAvatar imageUrl={favoriteTeam.logoUrl} name={favoriteTeam.name} size={44} fit="contain" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">Your team</p>
                <p className="font-semibold text-white">{favoriteTeam.name}</p>
              </div>
            </Link>
          ) : (
            <Link href="/profile?section=personalisation" className="text-sm font-medium text-neutral-400 hover:text-white">
              Choose your favorite team →
            </Link>
          )}

          <div className="flex items-center gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Points</p>
              <p className="font-mono text-lg font-semibold text-white">{pointsBalance ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Predictions</p>
              <p className="font-mono text-lg font-semibold text-white">{predictionCount}</p>
            </div>
          </div>
        </motion.div>
      )}

      {favoriteDriver?.code && (
        <div className="mt-6">
          <DriverFormStrip favoriteDriverCode={favoriteDriver.code} races={races} />
        </div>
      )}
    </section>
  );
}

export function PersonalOverviewSkeleton() {
  return (
    <section>
      <Skeleton className="skeleton-shimmer h-3 w-16 rounded" />
      <div className="mt-4 flex flex-wrap items-center gap-8">
        <div className="flex items-center gap-3">
          <Skeleton className="skeleton-shimmer h-12 w-12 rounded-full" />
          <Skeleton className="skeleton-shimmer h-8 w-24 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="skeleton-shimmer h-11 w-11 rounded-full" />
          <Skeleton className="skeleton-shimmer h-8 w-20 rounded" />
        </div>
        <Skeleton className="skeleton-shimmer h-10 w-32 rounded" />
      </div>
      <div className="mt-6">
        <DriverFormStripSkeleton />
      </div>
    </section>
  );
}
