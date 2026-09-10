"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RaceIntelligencePanel, RaceIntelligencePanelSkeleton } from "./RaceIntelligencePanel";
import { RaceReadiness, RaceReadinessSkeleton } from "./RaceReadiness";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowRightIcon, ConfettiIcon, ConstructorIcon, StarIcon, TargetIcon, TrophyIcon, WrenchIcon } from "@/components/icons/HomeIcons";
import { formatCountdownLive } from "@/lib/countdown";
import type { NextAction, PublicHomeData } from "@/lib/homeData";
import type { FactIconKind, FavoriteDriverCard, FavoriteTeamCard } from "@/lib/personalization";
import { raceHref } from "@/lib/routes";
import { useAuth } from "@/providers/AuthProvider";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";

const FACT_ICONS: Record<FactIconKind, typeof TrophyIcon> = {
  trophy: TrophyIcon,
  constructor: ConstructorIcon,
  target: TargetIcon,
  star: StarIcon,
  wrench: WrenchIcon,
  confetti: ConfettiIcon,
};

/** Ticks every second (not the shared `useMinuteClock` 60s tick RaceWeekendPanel/PickPanel use) -
 * this is the one countdown on the site meant to be glanced at while it's actively running down to
 * a real moment, so it should visibly move. Scoped to this file, not the shared hook, since a 1Hz
 * re-render of the whole hero is fine but isn't what those other call sites need. */
function useSecondClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** The actual wall-clock date/time, in whichever timezone the viewer's own browser is in -
 * `toLocaleString` with no explicit `timeZone` already does exactly that. It genuinely differs
 * between the server's render (the deployment's own timezone) and the client's (the visitor's
 * real one) - not a bug to route around with an effect, but the documented case
 * `suppressHydrationWarning` exists for (React's own docs use a locale-formatted date as the
 * example): render the real value both times, just don't warn that the two didn't match text. */
function localTimeLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The race, not the user, is the dominant visual — greeting (personal only) sits as a small
 * eyebrow above it, never competing with the round/race name for attention. Background (full-bleed
 * rotating circuit photos) lives one level up in HomeLayout; this is the 80vw-aligned content only.
 * Two columns on large screens: the race context on the left, real circuit-history intelligence on
 * the right — the hero's previously-empty right half, now doing real work instead of white space. */
export function RaceHero({
  publicData,
  variant,
  firstName,
  isReturning,
  nextAction,
  favoriteDriver,
  favoriteTeam,
}: {
  publicData: PublicHomeData;
  variant: "public" | "personal";
  firstName?: string;
  isReturning?: boolean;
  nextAction?: NextAction | null;
  favoriteDriver?: FavoriteDriverCard | null;
  favoriteTeam?: FavoriteTeamCard | null;
}) {
  const now = useSecondClock();
  const openAuthDialog = useAuthDialogStore((s) => s.open);
  const { isAuthorized } = useAuth();
  const { nextRace, calendarEntry, facts, trackHistory } = publicData;

  const raceSessionDate = calendarEntry?.sessions.find((s) => s.label.toLowerCase().includes("race"))?.date ?? calendarEntry?.raceDate ?? null;
  const countdown = raceSessionDate ? formatCountdownLive(new Date(raceSessionDate).getTime(), now) : "";
  const localTime = localTimeLabel(raceSessionDate);

  if (!nextRace) {
    return (
      <div className="pt-6">
        <h1 className="text-4xl font-bold text-white sm:text-5xl">F1 Hub</h1>
        <p className="mt-2 max-w-xl text-neutral-400">Every race, every result, every prediction.</p>
      </div>
    );
  }

  const heroAction = variant === "personal" ? nextAction : null;
  const primaryHref = heroAction?.section === "hero" ? heroAction.href : raceHref(nextRace.year, nextRace.round, nextRace.name);
  const primaryLabel = heroAction?.section === "hero" ? heroAction.label : "Explore race";

  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-[1fr_320px] lg:items-start xl:grid-cols-[1fr_360px]">
      <div>
        {variant === "personal" && firstName && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">{isReturning ? "Welcome back" : "Welcome"}</p>
            <h2 className="text-xl font-bold text-white">{firstName}</h2>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className={variant === "personal" && firstName ? "mt-3" : ""}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">Round {nextRace.round}</p>
          <h1 className="mt-1 max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">{nextRace.name}</h1>
          <p className="mt-1 text-neutral-400">{nextRace.circuit}</p>
        </motion.div>

        <div className="mt-5 flex flex-wrap items-center gap-6">
          {countdown && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Lights out in</p>
              <p suppressHydrationWarning className="font-mono text-2xl font-semibold text-white tabular-nums">
                {countdown}
              </p>
              {localTime && (
                <p suppressHydrationWarning className="mt-0.5 text-[11px] text-neutral-500">
                  {localTime} your time
                </p>
              )}
            </div>
          )}
          <RaceReadiness calendarEntry={calendarEntry} race={nextRace} />
        </div>

        {facts.length > 0 && (
          <p className="mt-3 flex max-w-2xl items-start gap-1.5 text-sm text-neutral-400">
            {(() => {
              const FactIcon = FACT_ICONS[facts[0].icon];
              return <FactIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--f1-red)]" />;
            })()}
            {facts[0].text}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={primaryHref}
            // The race page itself gate-checks the session and shows the sign-in dialog anyway
            // (see app/race/page.tsx's own SignInGate) - for a signed-out visitor that's a wasted
            // navigation just to land back on a dialog. Check here first and open the same dialog
            // directly instead, skip the round trip. `variant === "public"` already only renders
            // when the visitor isn't authorized, but isAuthorized is still checked explicitly
            // (not assumed from that alone) so this keeps working correctly if that ever changes.
            onClick={(e) => {
              if (variant === "public" && !isAuthorized) {
                e.preventDefault();
                openAuthDialog();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--f1-red)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {primaryLabel}
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
          {variant === "public" && (
            <button
              type="button"
              onClick={openAuthDialog}
              className="rounded-lg border border-[var(--f1-line)] px-5 py-2.5 text-sm font-semibold text-neutral-200 transition hover:border-white/30"
            >
              Sign up free
            </button>
          )}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
        <RaceIntelligencePanel circuitName={nextRace.circuit} trackHistory={trackHistory} favoriteDriver={favoriteDriver ?? null} favoriteTeam={favoriteTeam ?? null} />
      </motion.div>
    </div>
  );
}

export function RaceHeroSkeleton({ variant }: { variant: "public" | "personal" }) {
  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-[1fr_320px] lg:items-start xl:grid-cols-[1fr_360px]">
      <div>
        {variant === "personal" && (
          <>
            <Skeleton className="skeleton-shimmer h-3 w-24 rounded" />
            <Skeleton className="skeleton-shimmer mt-2 h-6 w-40 rounded" />
          </>
        )}
        <Skeleton className={`skeleton-shimmer h-3 w-20 rounded ${variant === "personal" ? "mt-3" : ""}`} />
        <Skeleton className="skeleton-shimmer mt-2 h-10 w-80 max-w-full rounded" />
        <Skeleton className="skeleton-shimmer mt-2 h-4 w-32 rounded" />
        <div className="mt-5 flex items-center gap-6">
          <div>
            <Skeleton className="skeleton-shimmer h-8 w-24 rounded" />
            <Skeleton className="skeleton-shimmer mt-1.5 h-2.5 w-28 rounded" />
          </div>
          <RaceReadinessSkeleton />
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Skeleton className="skeleton-shimmer h-4 w-4 shrink-0 rounded" />
          <Skeleton className="skeleton-shimmer h-3.5 w-64 max-w-full rounded" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Skeleton className="skeleton-shimmer h-9 w-36 rounded-lg" />
          {variant === "public" && <Skeleton className="skeleton-shimmer h-9 w-32 rounded-lg" />}
        </div>
      </div>
      <RaceIntelligencePanelSkeleton />
    </div>
  );
}
