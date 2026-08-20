import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { FavoriteDriverCard, FavoriteTeamCard, FavoriteTrackCard } from "@/lib/personalization";

function Card({ href, imageUrl, name, meta, fit }: { href: string; imageUrl: string | null; name: string; meta: string; fit?: "cover" | "contain" }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4 transition hover:border-white/30"
    >
      <EntityAvatar imageUrl={imageUrl} name={name} size={48} fit={fit} />
      <div className="min-w-0">
        <p className="truncate font-medium text-white">{name}</p>
        <p className="truncate text-xs text-neutral-500">{meta}</p>
      </div>
    </Link>
  );
}

/** Nothing shown at all if the profile has no favorites set — this is a bonus for someone who's
 * personalized their profile, not a prompt nagging everyone else to do so (that ask already lives
 * on /profile itself). Photos only exist for entities still active this season (getCurrentDriver/
 * getAllCurrentTeams in personalization.ts) — a retired driver's card still renders, just without
 * one, same honest "we don't have this" as everywhere else in the app. */
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
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {drivers.map((d) => (
          <Card
            key={d.driverId}
            href={d.href}
            imageUrl={d.headshotUrl}
            name={d.name}
            meta={d.isActiveThisSeason ? (d.team ?? "") : `${d.firstYear}–${d.lastYear} · ${d.raceCount} races`}
          />
        ))}
        {teams.map((t) => (
          <Card
            key={t.teamId}
            href={t.href}
            imageUrl={t.logoUrl}
            name={t.name}
            meta={t.isActiveThisSeason ? "Racing this season" : `${t.firstYear}–${t.lastYear} · ${t.raceCount} races`}
            fit="contain"
          />
        ))}
        {tracks.map((c) => (
          <Card key={c.circuitId} href={c.href} imageUrl={c.imageUrl} name={c.name} meta="Track history" fit="contain" />
        ))}
      </div>
    </section>
  );
}
