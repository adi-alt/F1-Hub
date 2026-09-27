"use client";


import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { predictionTypeLabels, type PredictionGuess, type PredictionType } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import { PredictionTrendBars } from "./PredictionTrendBars";
import { groupHref } from "@/lib/routes";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { PredictionEntry, type DriverOption } from "./PredictionEntry";

/**
 * A prediction round, rendered in the feed alongside discussions rather than hidden behind a
 * community's own Predictions tab - open, closed-awaiting-result, or (for a little while after an
 * admin resolves it, see listMyPredictions' own comment) resolved with a real outcome.
 *
 * Deliberately built from the same pieces as PostCard - the same frosted surface, the same C/
 * community identity, the same compact control row - so it reads as a post in the stream rather
 * than a widget dropped into it. The accent that tells them apart is one small badge and a red
 * edge, not a different card system.
 *
 * The market itself (predictionTypeLabels[type] - "Race winner", "Podium", ...) is the heading;
 * the race name is a small context line above it, not a second bold title - a community running
 * several rounds for the same race used to render three cards with an identical headline and
 * nothing to tell them apart at a glance.
 *
 * Entering still happens on the community's own Predictions tab. That's where the real guess UI
 * lives (a driver roster, a three-slot podium picker, wallet validation), and duplicating it here
 * would be a second implementation of the same interaction that could drift from the first. The
 * card carries everything needed to DECIDE - cost, real entry count, deadline, what the community
 * thinks, what you picked, and once resolved, what actually happened - and hands off for the act
 * itself.
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
  // viewer enters, so the feed never has to refetch to show back what they just picked. Keeps the
  // raw guess (not just its label) so the pick's own driver portrait(s) can render too.
  const [entered, setEntered] = useState<{ guess: PredictionGuess | null; label: string | null } | null>(
    prediction.hasEntered ? { guess: prediction.myGuess, label: prediction.myGuessLabel } : null,
  );
  const raceAt = prediction.raceDate ? parseUtcDateTime(prediction.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const closed = !!raceAt && raceAt <= now;
  const urgent = !!raceAt && raceAt > now && raceAt - now < 24 * 60 * 60 * 1000;
  const resolved = prediction.status === "resolved";

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

      {/* Race is context, not the headline - the market itself (what you're actually predicting)
          is. A community that runs several rounds for the same race (winner, podium, pole) used
          to render three cards with the exact same bold title and nothing to tell them apart at a
          glance. */}
      <p className="mt-1.5 truncate text-[10.5px] font-semibold uppercase tracking-[0.1em] text-neutral-500">{prediction.raceName}</p>
      <p className="mt-0.5 text-[15px] font-semibold leading-snug text-white">{predictionTypeLabels[prediction.type]}</p>
      {/* Cost, real entry count and deadline are one line of metadata, not three stacked blocks -
          together they answer "what is this and should I act now", which is a single question.
          entryCount is a real group_prediction_entries count, never a placeholder - a round with
          zero entries says so plainly rather than a generic "not enough responses yet". */}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] leading-tight text-neutral-500">
        <span className="font-semibold tabular-nums text-neutral-300">{prediction.entryPoints} pts</span>
        <span aria-hidden className="text-neutral-700">·</span>
        <span className="tabular-nums">{prediction.entryCount === 0 ? "No entries yet" : `${prediction.entryCount} ${prediction.entryCount === 1 ? "entry" : "entries"}`}</span>
        {countdown ? (
          <>
            <span aria-hidden className="text-neutral-700">·</span>
            <span className={`tabular-nums ${urgent ? "font-semibold text-[var(--f1-red)]" : ""}`}>closes in {countdown}</span>
          </>
        ) : closed && !resolved ? (
          <>
            <span aria-hidden className="text-neutral-700">·</span>
            <span>closed, awaiting result</span>
          </>
        ) : null}
      </p>

      {!resolved && <PredictionTrendBars groupId={prediction.groupId} predictionId={prediction.id} isPodium={prediction.type === "podium"} />}

      <div className="flex flex-wrap items-center gap-2">
        {resolved ? (
          <ResolvedResult prediction={prediction} drivers={drivers} />
        ) : entered ? (
          <span className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] px-2.5 text-[11.5px] text-emerald-200/90">
            <CheckIcon />
            <span className="shrink-0 font-semibold">Entered</span>
            {entered.guess !== null && <GuessAvatars type={prediction.type} guess={entered.guess} drivers={drivers} />}
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
            onEntered={(guess, label) => setEntered({ guess, label })}
          />
        )}
      </div>
    </motion.article>
  );
}

/** The round's real, final outcome - `correctAnswerLabel`/`myPointsAwarded` are only ever set once
 * `resolvePrediction` has actually run (see groupPredictions.ts), so this never guesses at a result
 * ahead of the real one. A viewer who never entered sees the outcome but no personal verdict -
 * there is nothing of theirs to score. */
function ResolvedResult({ prediction, drivers }: { prediction: FeedPrediction; drivers: DriverOption[] }) {
  const correct = prediction.hasEntered && prediction.myPointsAwarded !== null && prediction.myPointsAwarded > 0;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {prediction.correctAnswerLabel && (
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-neutral-300">
          {prediction.correctAnswer !== null && <GuessAvatars type={prediction.type} guess={prediction.correctAnswer} drivers={drivers} />}
          Result: <span className="font-semibold text-white">{prediction.correctAnswerLabel}</span>
        </span>
      )}
      {prediction.hasEntered ? (
        <span
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-semibold ${
            correct ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200/90" : "border-white/[0.08] bg-white/[0.03] text-neutral-400"
          }`}
        >
          {correct ? <CheckIcon /> : null}
          {correct ? `Correct · +${prediction.myPointsAwarded} pts` : "Incorrect"}
        </span>
      ) : (
        <span className="shrink-0 text-[11.5px] text-neutral-500">You didn&apos;t enter this round.</span>
      )}
      <Link href={`${groupHref(prediction.groupId)}?tab=predictions`} className="shrink-0 text-[11.5px] font-medium text-neutral-400 transition hover:text-white">
        View result →
      </Link>
    </div>
  );
}

/** A real portrait per driver code in a guess/result - "HAM" alone said nothing to a viewer who
 * doesn't already know the grid by heart, and this app already has real headshots for the current
 * roster threaded through `drivers` (see media.ts, and groups/page.tsx's getDriversByRace). A
 * podium guess gets a small overlapping stack in guess order; a single-driver guess gets one.
 * dnf_count has no driver to show. A departed driver falls back to EntityAvatar's own initials. */
function GuessAvatars({ type, guess, drivers }: { type: PredictionType; guess: PredictionGuess; drivers: DriverOption[] }) {
  if (type === "dnf_count") return null;
  const codes = Array.isArray(guess) ? guess : [String(guess)];
  return (
    <span className="flex shrink-0 items-center">
      {codes.map((code, i) => {
        const driver = drivers.find((d) => d.code === code);
        return (
          <span key={code} className={i > 0 ? "-ml-1.5" : ""} style={{ zIndex: codes.length - i }}>
            <EntityAvatar imageUrl={driver?.headshotUrl ?? null} name={driver?.name ?? code} seed={code} size={18} />
          </span>
        );
      })}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" width="10" height="10" fill="none" aria-hidden className="shrink-0">
      <path d="m2.8 7.4 2.6 2.6 5.8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
