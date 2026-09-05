"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { RaceReadiness, RaceReadinessSkeleton } from "./RaceReadiness";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown } from "@/lib/countdown";
import type { NextAction, PublicHomeData } from "@/lib/homeData";
import { raceHref } from "@/lib/routes";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";

/** The race, not the user, is the dominant visual — greeting (personal only) sits as a small
 * eyebrow above it, never competing with the round/race name for attention. Background (full-bleed
 * rotating circuit photos) lives one level up in HomeLayout; this is the 80vw-aligned content only. */
export function RaceHero({
  publicData,
  variant,
  firstName,
  isReturning,
  nextAction,
}: {
  publicData: PublicHomeData;
  variant: "public" | "personal";
  firstName?: string;
  isReturning?: boolean;
  nextAction?: NextAction | null;
}) {
  const now = useMinuteClock();
  const openAuthDialog = useAuthDialogStore((s) => s.open);
  const { nextRace, calendarEntry, facts } = publicData;

  const raceSessionDate = calendarEntry?.sessions.find((s) => s.label.toLowerCase().includes("race"))?.date ?? calendarEntry?.raceDate ?? null;
  const countdown = raceSessionDate ? formatCountdown(new Date(raceSessionDate).getTime(), now) : "";

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
    <div className="pt-6">
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
        className={variant === "personal" && firstName ? "mt-4" : ""}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">Round {nextRace.round}</p>
        <h1 className="mt-1 max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">{nextRace.name}</h1>
        <p className="mt-1 text-neutral-400">{nextRace.circuit}</p>
      </motion.div>

      <div className="mt-6 flex flex-wrap items-center gap-8">
        {countdown && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Lights out in</p>
            <p className="font-mono text-2xl font-semibold text-white">{countdown}</p>
          </div>
        )}
        <RaceReadiness calendarEntry={calendarEntry} race={nextRace} />
      </div>

      {facts.length > 0 && (
        <p className="mt-4 max-w-2xl text-sm text-neutral-400">
          <span aria-hidden>{facts[0].icon}</span> {facts[0].text}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={primaryHref}
          className="rounded-full bg-[var(--f1-red)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          {primaryLabel} →
        </Link>
        {variant === "public" && (
          <button
            type="button"
            onClick={openAuthDialog}
            className="rounded-full border border-[var(--f1-line)] px-5 py-2.5 text-sm font-semibold text-neutral-200 transition hover:border-white/30"
          >
            Sign up free
          </button>
        )}
      </div>
    </div>
  );
}

export function RaceHeroSkeleton({ variant }: { variant: "public" | "personal" }) {
  return (
    <div className="pt-6">
      {variant === "personal" && (
        <>
          <Skeleton className="skeleton-shimmer h-3 w-24 rounded" />
          <Skeleton className="skeleton-shimmer mt-2 h-6 w-40 rounded" />
        </>
      )}
      <Skeleton className={`skeleton-shimmer h-3 w-20 rounded ${variant === "personal" ? "mt-6" : ""}`} />
      <Skeleton className="skeleton-shimmer mt-2 h-10 w-80 max-w-full rounded" />
      <Skeleton className="skeleton-shimmer mt-2 h-4 w-32 rounded" />
      <div className="mt-6 flex items-center gap-8">
        <Skeleton className="skeleton-shimmer h-8 w-24 rounded" />
        <RaceReadinessSkeleton />
      </div>
      <Skeleton className="skeleton-shimmer mt-6 h-9 w-36 rounded-full" />
    </div>
  );
}
