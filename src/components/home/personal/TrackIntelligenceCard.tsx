"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useHomepageIntelligence } from "@/components/home/ai/HomepageIntelligenceProvider";
import { Typewriter } from "@/components/motion/Typewriter";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrackMap } from "@/components/ui/TrackMap";
import type { TrackHistory } from "@/lib/personalization";

const n = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;

/**
 * The hero's right-hand widget (the old home's, kept by request): the circuit's track map and its record holders, and
 * Apex's outlook for your driver. One frosted card beside the race; your favourites' records here sit in the left
 * column (FavouritesHere), so the two columns come out the same height.
 */
export function TrackIntelligenceCard({ circuit, history }: { circuit: string; history: TrackHistory | null }) {
  const { intelligence, isLoading } = useHomepageIntelligence();
  if (!history) return null;
  const outlook = intelligence?.personalOutlook?.overallAssessment ?? intelligence?.personalRaceBrief?.whyItMatters ?? null;
  const people = [
    history.topPerformer && { key: `w-${history.topPerformer.driverId}`, name: history.topPerformer.driverName, img: history.topPerformer.photoUrl, href: history.topPerformer.href, detail: `Most wins here (${history.topPerformer.wins})`, logo: false },
    history.defendingWinner && { key: `d-${history.defendingWinner.driverId}`, name: history.defendingWinner.driverName, img: history.defendingWinner.photoUrl, href: history.defendingWinner.href, detail: `Defending winner (${history.defendingWinner.year})`, logo: false },
    history.topCurrentTeam && { key: `t-${history.topCurrentTeam.name}`, name: history.topCurrentTeam.name, img: history.topCurrentTeam.logoUrl, href: null, detail: `Most team wins here (${history.topCurrentTeam.wins})`, logo: true },
  ].filter(Boolean) as { key: string; name: string; img: string | null; href: string | null; detail: string; logo: boolean }[];

  return (
    <section aria-labelledby="track-intel" className="flex h-full min-w-0 flex-col rounded-card bg-surface-1 p-5">
      <TrackMap map={history.trackMap} name={circuit} className="aspect-[16/9] w-full" />
      <div className={`${history.trackMap ? "mt-4" : ""} flex items-baseline justify-between gap-3`}>
        <h2 id="track-intel" className="text-title-md text-primary">
          Track intelligence
        </h2>
        <span className="shrink-0 rounded-control bg-white/[0.06] px-2 py-0.5 text-caption tabular text-secondary">{n(history.totalRaces, "GP")}</span>
      </div>
      <p className="text-caption text-secondary">
        {circuit} · {history.firstYear}–{history.lastYear}
      </p>

      <ul className="mt-3 space-y-2.5">
        {people.map((p) => {
          const row = (
            <>
              <EntityAvatar imageUrl={p.img} name={p.name} size={32} shape={p.logo ? "square" : "circle"} fit={p.logo ? "contain" : "cover"} />
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-medium text-primary">{p.name}</span>
                <span className="block text-caption text-secondary">{p.detail}</span>
              </span>
            </>
          );
          return (
            <li key={p.key}>
              {p.href ? (
                <Link href={p.href} className="-mx-2 flex items-center gap-3 rounded-control px-2 py-1 transition-colors duration-fast hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-3 py-1">{row}</div>
              )}
            </li>
          );
        })}
      </ul>


      {(outlook || isLoading) && (
        <div className="mt-auto border-t border-subtle pt-4">
          <p className="flex items-center gap-1.5 text-caption text-tertiary">
            <Icon icon={Sparkles} size={16} className="text-brand-text" />
            Your outlook · AI summary
          </p>
          {outlook ? (
            <p className="mt-1.5 text-body-sm text-secondary">
              <Typewriter text={outlook} msPerChar={14} />
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              <Skeleton shape="text" className="w-full" />
              <Skeleton shape="text" className="w-4/5" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Your favourites' records at this circuit, as a row of chips under the hero's action. */
export function FavouritesHere({ circuit, history }: { circuit: string; history: TrackHistory | null }) {
  if (!history) return null;
  const favourites = [
    ...history.favoriteDriverCircuitStatsList.map((s) => ({ key: s.driverId, name: s.driverName, wins: s.wins, podiums: s.podiums, starts: s.appearances, best: s.bestFinish })),
    ...history.favoriteTeamCircuitStatsList.map((s) => ({ key: s.teamId, name: s.teamName, wins: s.wins, podiums: s.podiums, starts: s.appearances, best: s.bestFinish })),
  ];
  if (favourites.length === 0) return null;
  return (
    <section aria-labelledby="favs-here">
      <h2 id="favs-here" className="text-body-sm font-semibold text-primary">
        Your favourites at {circuit}
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {favourites.slice(0, 6).map((f) => (
          <li key={f.key} className="min-w-0 rounded-control bg-surface-1 px-3 py-2">
            <p className="truncate text-body-sm font-medium text-primary">{f.name}</p>
            <p className="text-caption tabular text-secondary">
              {f.wins ? n(f.wins, "win") : f.podiums ? n(f.podiums, "podium") : f.best ? `Best P${f.best}` : n(f.starts, "start")} in {n(f.starts, "start")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
