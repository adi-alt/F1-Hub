"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Clock, Trophy } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { countryFlag } from "@/lib/countryFlag";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { predictionStateAt, predictionTypeLabels } from "@/lib/groupPredictionTypes";
import { groupHref, raceHref } from "@/lib/routes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary } from "@/lib/supabase/groups";
import type { NextRace } from "./CommunityPulse";

/**
 * The top of the Communities home: the race weekend, and every prediction round open across your communities, each
 * saying whether you're in and what to do next. It's the most time-bound thing on the page, so it comes first.
 * Rounds come from listMyPredictions (the page's own fetch), filtered to the ones still taking entries by their
 * real deadline (lockAt) against a clock that ticks, so a round leaves the moment it closes.
 */
export function ThisWeekend({ race, predictions, groups }: { race: NextRace; predictions: FeedPrediction[]; groups: GroupSummary[] }) {
  const now = useMinuteClock();
  const open = predictions.filter((p) => predictionStateAt(p.status, p.lockAt, now) === "open").sort((a, b) => (a.lockAt ?? "").localeCompare(b.lockAt ?? ""));
  const avatarOf = (id: string) => groups.find((g) => g.id === id)?.avatarUrl ?? null;

  return (
    <section aria-labelledby="this-weekend" data-tour="race-weekend">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="this-weekend" className="text-title-lg text-primary">
          This weekend
        </h2>
        <p className="text-body-sm text-secondary">
          {open.length ? `${open.length} prediction round${open.length === 1 ? "" : "s"} open across your communities` : "No prediction rounds open yet"}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <RaceCard race={race} now={now} />
        {open.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {open.slice(0, 4).map((p, i) => (
              <motion.li key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05, ease: [0.2, 0, 0, 1] }} className="min-w-0">
                <RoundCard p={p} now={now} avatarUrl={avatarOf(p.groupId)} />
              </motion.li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start justify-center rounded-card border border-dashed border-white/15 p-6">
            <Icon icon={Trophy} size={20} className="text-tertiary" />
            <p className="mt-3 text-body-sm font-medium text-primary">Rounds open as the weekend approaches</p>
            <p className="mt-1 max-w-md text-caption text-secondary">Each community opens its own: race winner, pole, the podium. They close when qualifying starts.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function RaceCard({ race, now }: { race: NextRace; now: number }) {
  if (!race) {
    return (
      <div className="rounded-card border border-white/10 bg-surface-1/60 p-5">
        <p className="text-body-sm text-secondary">No race is scheduled yet.</p>
      </div>
    );
  }
  const raceAt = race.raceDate ? parseUtcDateTime(race.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const flag = countryFlag(race.country);
  return (
    <Link
      href={raceHref(race.year, race.round, race.name)}
      className="group relative flex min-h-48 flex-col justify-end overflow-hidden rounded-card border border-white/10 bg-surface-1 p-5 transition-colors duration-fast hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      {race.photoUrl ? (
        <>
          <Image src={race.photoUrl} alt="" fill sizes="(min-width: 1024px) 352px, 100vw" className="object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.03]" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-surface-0 via-surface-0/70 to-surface-0/10" />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgb(225_6_0/0.18),transparent_60%)]" />
      )}
      <div className="relative">
        <p className="text-caption text-secondary">Round {race.round}</p>
        <p className="mt-1 flex items-start gap-2 text-title-md font-semibold text-primary">
          {flag && <span aria-hidden>{flag}</span>}
          <span className="min-w-0">{race.name}</span>
        </p>
        {race.circuit && <p className="mt-0.5 text-caption text-secondary">{race.circuit}</p>}
        <div className="mt-4 flex items-end justify-between gap-3">
          {countdown ? (
            <p suppressHydrationWarning>
              <span className="block text-caption text-secondary">Lights out in</span>
              <span className="text-display-md font-semibold tabular text-primary">{countdown}</span>
            </p>
          ) : (
            <p className="text-body-sm text-secondary">{race.raceDate ? "Race weekend underway" : "Date to be confirmed"}</p>
          )}
          <span className="flex items-center gap-1 text-caption font-medium text-secondary transition-colors duration-fast group-hover:text-primary">
            Race page <Icon icon={ArrowRight} size={16} className="transition-transform duration-fast group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function RoundCard({ p, now, avatarUrl }: { p: FeedPrediction; now: number; avatarUrl: string | null }) {
  const lockMs = p.lockAt ? Date.parse(p.lockAt) : null;
  const countdown = lockMs !== null ? formatCountdown(lockMs, now) : null;
  const urgent = lockMs !== null && lockMs - now < 24 * 3600 * 1000;
  const href = `${groupHref(p.groupId)}?tab=predictions`;
  return (
    <div className="flex h-full flex-col rounded-card border border-white/10 bg-surface-1/70 p-4">
      <div className="flex items-center gap-2">
        <EntityAvatar imageUrl={avatarUrl} name={p.groupName} seed={p.groupId} size={24} />
        <p className="min-w-0 flex-1 truncate text-caption text-secondary">{p.groupName}</p>
        <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-caption font-medium tabular text-primary">{p.entryPoints} pts</span>
      </div>
      <p className="mt-3 text-body font-semibold text-primary">{predictionTypeLabels[p.type]}</p>
      <p className="text-caption text-secondary">
        {p.raceName} · {p.entryCount} {p.entryCount === 1 ? "entry" : "entries"}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        {p.hasEntered ? (
          <p className="flex min-w-0 items-center gap-1.5 text-caption text-success">
            <Icon icon={Check} size={16} />
            <span className="truncate">{p.myGuessLabel ? `You picked ${p.myGuessLabel}` : "You're in"}</span>
          </p>
        ) : countdown ? (
          <p suppressHydrationWarning className={`flex items-center gap-1.5 text-caption tabular ${urgent ? "font-medium text-warning" : "text-secondary"}`}>
            <Icon icon={Clock} size={16} />
            Closes in {countdown}
          </p>
        ) : (
          <span />
        )}
        <Button variant={p.hasEntered ? "ghost" : "secondary"} size="sm" asChild>
          <Link href={href}>{p.hasEntered ? "View" : "Enter"}</Link>
        </Button>
      </div>
    </div>
  );
}
