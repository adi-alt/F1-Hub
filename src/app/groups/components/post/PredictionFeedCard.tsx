"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction, PredictionTrend } from "@/lib/supabase/groupPredictions";
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

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/55 px-3.5 py-3 backdrop-blur-sm transition hover:border-white/[0.12]"
    >
      <span aria-hidden className="absolute left-0 top-0 h-full w-[2px] bg-[var(--f1-red)]/60" />

      <div className="flex items-center gap-2">
        {showGroup && (
          <Link href={groupHref(prediction.groupId)} className="flex min-w-0 items-center gap-1.5 transition hover:text-neutral-200">
            <EntityAvatar imageUrl={null} name={prediction.groupName} seed={prediction.groupId} size={16} shape="square" />
            <span className="min-w-0 truncate text-[11.5px] font-medium text-neutral-400">
              <span aria-hidden className="mr-1 font-mono text-[10px] font-normal text-neutral-600">
                C/
              </span>
              {prediction.groupName}
            </span>
          </Link>
        )}
        <span className="ml-auto shrink-0 rounded-full border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/[0.12] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--f1-red)]">
          Prediction
        </span>
      </div>

      <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-white">{prediction.raceName}</p>
      <p className="mt-0.5 text-[11.5px] text-neutral-400">{predictionTypeLabels[prediction.type]}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
        <span className="font-semibold tabular-nums text-neutral-300">{prediction.entryPoints} pts to enter</span>
        {countdown ? (
          <span className="tabular-nums text-neutral-500">Closes in {countdown}</span>
        ) : closed ? (
          <span className="text-neutral-500">Closed · awaiting result</span>
        ) : null}
      </div>

      <PredictionTrendBars prediction={prediction} />

      <div className="mt-2.5 flex items-center gap-2">
        {prediction.hasEntered ? (
          <span className="min-w-0 truncate text-[11.5px] text-neutral-400">
            <span className="font-semibold uppercase tracking-wide text-emerald-400/90">Entered</span>
            {prediction.myGuessLabel && <span> · Your pick: {prediction.myGuessLabel}</span>}
          </span>
        ) : closed ? (
          <span className="text-[11.5px] text-neutral-500">You didn&apos;t enter this round.</span>
        ) : (
          <Link
            href={`${groupHref(prediction.groupId)}?tab=predictions`}
            className="flex items-center gap-1 rounded-lg bg-[var(--f1-red)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
          >
            Enter prediction
            <ChevronIcon />
          </Link>
        )}
      </div>
    </motion.article>
  );
}

/**
 * What the community has actually entered, fetched per card only after it mounts so a feed of
 * predictions doesn't block on N aggregate queries before rendering anything.
 *
 * Renders nothing at all until there is something real to show, and says so plainly below the
 * threshold rather than drawing bars from two entries as though they were a consensus.
 */
const MIN_ENTRIES_FOR_TREND = 3;

function PredictionTrendBars({ prediction }: { prediction: FeedPrediction }) {
  const [trend, setTrend] = useState<PredictionTrend | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/groups/${prediction.groupId}/predictions/${prediction.id}/trend`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`trend: ${res.status}`);
        return res.json() as Promise<PredictionTrend>;
      })
      .then(setTrend)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [prediction.groupId, prediction.id]);

  // A failed aggregate is context this card can do without - the cost, deadline and entry action
  // above it are all still correct and usable, so this stays silent rather than showing an error
  // for a supporting detail.
  if (failed || !trend) return null;

  if (trend.total < MIN_ENTRIES_FOR_TREND) {
    return (
      <p className="mt-2 text-[11px] text-neutral-600">
        {trend.total === 0 ? "No entries yet." : `Not enough responses yet (${trend.total}).`}
      </p>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          Community trend{prediction.type === "podium" ? " · winner pick" : ""}
        </p>
        <span className="text-[10px] tabular-nums text-neutral-600">
          {trend.total} {trend.total === 1 ? "entry" : "entries"}
        </span>
      </div>
      <ul className="mt-1.5 space-y-1">
        {trend.options.map((o) => (
          <li key={o.key} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-neutral-300">{o.label}</span>
            <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-white/[0.06]" role="presentation">
              <span className="block h-full rounded-full bg-[var(--f1-red)]/70" style={{ width: `${o.pct}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-neutral-400">{o.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" width="9" height="9" fill="none" aria-hidden>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
