import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { PosterImage } from "./PosterImage";
import type { FavoriteDriverCard, FavoriteTeamCard, FavoriteTrackCard } from "@/lib/personalization";

/** Nothing shown at all if the profile has no favorites set — this is a bonus for someone who's
 * personalized their profile, not a prompt nagging everyone else to do so (that ask already lives
 * on /profile itself). Drivers/tracks get the big poster treatment; team logos don't - a logo
 * full-bleed-cropped to a tall poster loses the shape that makes it recognizable, so that one
 * stays a contained card (same reasoning EntityAvatar's `fit="contain"` already documents). */
export function FavoritesSection({
  drivers,
  teams,
  tracks,
}: {
  drivers: FavoriteDriverCard[];
  teams: FavoriteTeamCard[];
  tracks: FavoriteTrackCard[];
}) {
  if (drivers.length === 0 && teams.length === 0 && tracks.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Your favorites</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {drivers.map((d) => (
          <Link key={d.driverId} href={d.href} className="block transition hover:opacity-90">
            <PosterImage
              imageUrl={d.headshotUrl}
              title={d.name}
              subtitle={d.isActiveThisSeason ? (d.team ?? undefined) : `${d.firstYear}–${d.lastYear} · ${d.raceCount} races`}
            />
          </Link>
        ))}
        {tracks.map((c) => (
          <Link key={c.circuitId} href={c.href} className="block transition hover:opacity-90">
            <PosterImage imageUrl={c.imageUrl} title={c.name} subtitle="Track history" />
          </Link>
        ))}
        {teams.map((t) => (
          <Link
            key={t.teamId}
            href={t.href}
            className="flex items-center gap-3 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4 transition hover:border-white/30"
          >
            <EntityAvatar imageUrl={t.logoUrl} name={t.name} size={48} fit="contain" />
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{t.name}</p>
              <p className="truncate text-xs text-neutral-500">
                {t.isActiveThisSeason ? "Racing this season" : `${t.firstYear}–${t.lastYear} · ${t.raceCount} races`}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
