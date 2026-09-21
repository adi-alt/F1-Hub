"use client";


import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import { PredictionTrendBars } from "./PredictionTrendBars";
import { groupHref } from "@/lib/routes";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { PredictionEntry, type DriverOption } from "./PredictionEntry";

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
export function PredictionFeedCard({
  prediction,
  index = 0,
  showGroup,
  drivers = [],
}: {
  prediction: FeedPrediction;
  index?: number;
  showGroup: boolean;
  /** Real roster for THIS round's race, so entry can happen here rather than by navigating to the
   * community page. Empty is a real state - PredictionEntry says so instead of offering nothing. */
  drivers?: DriverOption[];
}) {
  const now = useMinuteClock();
  // Entry updates the card in place. Seeded from the server value, then owned locally once the
  // viewer enters, so the feed never has to refetch to show back what they just picked.
  const [entered, setEntered] = useState<{ label: string | null } | null>(prediction.hasEntered ? { label: prediction.myGuessLabel } : null);
  const raceAt = prediction.raceDate ? parseUtcDateTime(prediction.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const closed = !!raceAt && raceAt <= now;
  const urgent = !!raceAt && raceAt > now && raceAt - now < 24 * 60 * 60 * 1000;

  return (
    <motion.article
      // layout: the card grows when the trend bars resolve and when the entry panel opens. Without
      // this it snaps; with it the height eases and the feed below slides rather than jumps.
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="relative rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/55 px-3.5 py-3 backdrop-blur-sm transition hover:border-white/[0.12]"
    >
      {/* Rounded on its own rather than clipped by an overflow-hidden parent - that clip also
          cut off content while the card animated to a new height. */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-gradient-to-r from-[var(--f1-red)]/70 to-transparent" />

      <div className="flex items-center gap-2.5">
        {showGroup ? (
          <Link href={groupHref(prediction.groupId)} className="flex min-w-0 items-center gap-2.5 transition hover:opacity-80">
            <EntityAvatar imageUrl={null} name={prediction.groupName} seed={prediction.groupId} size={34} />
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
        <span className="ml-auto shrink-0 rounded-md border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/[0.12] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--f1-red)]">
          Prediction
        </span>
      </div>

      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{prediction.raceName}</p>
      {/* Type, cost and deadline are one line of metadata, not three stacked blocks - together
          they answer "what is this and should I act now", which is a single question. */}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] leading-tight text-neutral-500">
        <span>{predictionTypeLabels[prediction.type]}</span>
        <span aria-hidden className="text-neutral-700">·</span>
        <span className="font-semibold tabular-nums text-neutral-300">{prediction.entryPoints} pts</span>
        {countdown ? (
          <>
            <span aria-hidden className="text-neutral-700">·</span>
            <span className={`tabular-nums ${urgent ? "font-semibold text-[var(--f1-red)]" : ""}`}>closes in {countdown}</span>
          </>
        ) : closed ? (
          <>
            <span aria-hidden className="text-neutral-700">·</span>
            <span>closed, awaiting result</span>
          </>
        ) : null}
      </p>

      <PredictionTrendBars groupId={prediction.groupId} predictionId={prediction.id} isPodium={prediction.type === "podium"} />

      <div className="flex flex-wrap items-center gap-2">
        {entered ? (
          <span className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] px-2.5 text-[11.5px] text-emerald-200/90">
            <CheckIcon />
            <span className="shrink-0 font-semibold">Entered</span>
            {entered.label && <span className="min-w-0 truncate text-neutral-300">· {entered.label}</span>}
          </span>
        ) : (
          <PredictionEntry
            groupId={prediction.groupId}
            predictionId={prediction.id}
            type={prediction.type}
            entryPoints={prediction.entryPoints}
            drivers={drivers}
            closed={closed}
            onEntered={(_guess, label) => setEntered({ label })}
          />
        )}
      </div>
    </motion.article>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" width="10" height="10" fill="none" aria-hidden className="shrink-0">
      <path d="m2.8 7.4 2.6 2.6 5.8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
