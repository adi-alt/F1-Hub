"use client";


import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import { PredictionTrendBars } from "./PredictionTrendBars";
import { groupHref } from "@/lib/routes";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";

/**
 * An open prediction round, rendered in the feed alongside discussions rather than hidden behind a
 * community's own Predictions tab.
 *
 * Deliberately built from the same pieces as PostCard - the same frosted surface, the same C/
 * community identity, the same compact control row - so it reads as a post in the stream rather
 * than a widget dropped into it. The accent that tells them apart is one small badge and a red
 * edge, not a different card system.
 *
 * Entering still happens on the community's own Predictions tab. That's where the real guess UI
 * lives (a driver roster, a three-slot podium picker, wallet validation), and duplicating it here
 * would be a second implementation of the same interaction that could drift from the first. The
 * card carries everything needed to DECIDE - cost, deadline, what the community thinks, what you
 * picked - and hands off for the act itself.
 */
export function PredictionFeedCard({ prediction, index = 0, showGroup }: { prediction: FeedPrediction; index?: number; showGroup: boolean }) {
  const now = useMinuteClock();
  const raceAt = prediction.raceDate ? parseUtcDateTime(prediction.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const closed = !!raceAt && raceAt <= now;
  const urgent = !!raceAt && raceAt > now && raceAt - now < 24 * 60 * 60 * 1000;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 p-4 backdrop-blur-sm transition hover:border-white/[0.12]"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[var(--f1-red)]/70 to-transparent" />

      <div className="flex items-center gap-2.5">
        {showGroup ? (
          <Link href={groupHref(prediction.groupId)} className="flex min-w-0 items-center gap-2.5 transition hover:opacity-80">
            <EntityAvatar imageUrl={null} name={prediction.groupName} seed={prediction.groupId} size={36} />
            <span className="min-w-0 truncate text-sm font-semibold text-white">
              <span aria-hidden className="mr-1 font-mono text-xs font-normal text-neutral-500">
                C/
              </span>
              {prediction.groupName}
            </span>
          </Link>
        ) : (
          <span className="text-sm font-semibold text-white">Prediction round</span>
        )}
        <span className="ml-auto shrink-0 rounded-full border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/[0.12] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--f1-red)]">
          Prediction
        </span>
      </div>

      <p className="mt-2.5 text-[15px] font-semibold leading-snug text-white">{prediction.raceName}</p>
      <p className="mt-0.5 text-[13px] text-neutral-400">{predictionTypeLabels[prediction.type]}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-neutral-200">{prediction.entryPoints} pts to enter</span>
        {countdown ? (
          <span className={`rounded-full px-2.5 py-1 text-[11px] tabular-nums ${urgent ? "bg-[var(--f1-red)]/[0.12] font-semibold text-[var(--f1-red)]" : "text-neutral-500"}`}>Closes in {countdown}</span>
        ) : closed ? (
          <span className="text-[11px] text-neutral-500">Closed · awaiting result</span>
        ) : null}
      </div>

      <PredictionTrendBars groupId={prediction.groupId} predictionId={prediction.id} isPodium={prediction.type === "podium"} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {prediction.hasEntered ? (
          <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-1.5 text-xs text-emerald-200/90">
            <CheckIcon />
            <span className="shrink-0 font-semibold">Entered</span>
            {prediction.myGuessLabel && <span className="min-w-0 truncate text-neutral-300">· {prediction.myGuessLabel}</span>}
          </span>
        ) : closed ? (
          <span className="text-xs text-neutral-500">You didn&apos;t enter this round.</span>
        ) : (
          <Link
            href={`${groupHref(prediction.groupId)}?tab=predictions`}
            className="flex items-center gap-1.5 rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Enter prediction
            <ChevronIcon />
          </Link>
        )}
      </div>
    </motion.article>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" width="10" height="10" fill="none" aria-hidden className="shrink-0">
      <path d="m2.8 7.4 2.6 2.6 5.8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
