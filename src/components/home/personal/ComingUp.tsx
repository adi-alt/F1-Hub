"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { tiltProps } from "@/components/motion/useTilt";
import { Icon } from "@/components/ui/Icon";
import { TrackMap } from "@/components/ui/TrackMap";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import type { PublicHomeData } from "@/lib/homeData";
import { raceHref } from "@/lib/routes";

/**
 * The next three rounds as small race cards: the track map, the round, the race, its date and how far away it is.
 * Each opens its race; they tilt toward the cursor like the rest of the home.
 */
export function ComingUp({ publicData }: { publicData: PublicHomeData }) {
  const now = useMinuteClock();
  const nextRound = publicData.nextRace?.round ?? 0;
  const rounds = publicData.races
    .filter((r) => r.round > nextRound && r.status !== "completed")
    .sort((a, b) => a.round - b.round)
    .slice(0, 3);
  if (rounds.length === 0) return null;
  return (
    <section aria-labelledby="coming-up" className="min-w-0">
      <h3 id="coming-up" className="text-body-sm font-semibold text-primary">
        Coming up
      </h3>
      <ol className="mt-3 space-y-3">
        {rounds.map((r) => {
          const date = publicData.calendarByRound[r.round]?.raceDate ?? null;
          const at = date ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : null;
          const days = at ? Math.max(0, Math.round((at.getTime() - now) / 86400000)) : null;
          return (
            <li key={r.id}>
              <Link
                href={raceHref(r.year, r.round, r.name)}
                {...tiltProps()}
                className="tilt group flex items-center gap-4 rounded-card bg-surface-1 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <div className="w-24 shrink-0">
                  {publicData.trackMapByRound?.[r.round] ? (
                    <TrackMap map={publicData.trackMapByRound[r.round]} name={r.circuit} compact className="aspect-[3/2] w-24" />
                  ) : (
                    <div className="flex aspect-[3/2] w-24 items-center justify-center rounded-card bg-white/[0.04] text-title-md tabular text-tertiary">R{r.round}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-caption tabular text-secondary">
                    Round {r.round}
                    {at ? ` · ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
                  </p>
                  <p className="line-clamp-2 text-body-sm font-semibold text-primary">{r.name}</p>
                  <p className="truncate text-caption text-tertiary">{r.circuit}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {days !== null && (
                    <span className="rounded-control bg-white/[0.06] px-2 py-0.5 text-caption tabular text-primary">{days === 0 ? "Today" : `in ${days} ${days === 1 ? "day" : "days"}`}</span>
                  )}
                  <Icon icon={ArrowUpRight} size={16} className="text-tertiary transition-transform duration-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
