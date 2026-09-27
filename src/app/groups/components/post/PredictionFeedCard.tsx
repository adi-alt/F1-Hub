"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { PredictionGuess, PredictionType } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import { PredictionTrendBars } from "./PredictionTrendBars";
import { groupHref } from "@/lib/routes";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { timeAgo } from "@/lib/format";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { PredictionEntry, type DriverOption } from "./PredictionEntry";

/** "Podium" (predictionTypeLabels' own label) -> "Predict the podium" - a real action phrase
 * derived from the round's own `type`, not a hardcoded string repeated identically on every card.
 * There is no separate "question" text anywhere in the schema (a prediction round is just a race +
 * a type + an entry cost - see groupPredictionTypes.ts), so this is the closest honest equivalent:
 * computed from real data, distinct per type, never invented per-round copy. */
const marketTitle: Record<PredictionType, string> = {
  winner: "Predict the race winner",
  podium: "Predict the podium",
  fastest_lap: "Predict the fastest lap",
  pole: "Predict pole position",
  dnf_count: "Predict the number of DNFs",
};

/**
 * A prediction round, rendered in the feed alongside discussions rather than hidden behind a
 * community's own Predictions tab - open, closed-awaiting-result, or (for a little while after an
 * admin resolves it, see listMyPredictions' own comment) resolved with a real outcome.
 *
 * Deliberately compact: the market itself (marketTitle[type] - "Predict the podium", not the race
 * name) is the one bold line, everything else - community, race, cost, entries, deadline - is
 * small and secondary, and a pick is a stack of short position rows with a real portrait per
 * driver (GuessSummary) rather than a single comma-joined name string or a full-width green
 * banner. Built from the same pieces as PostCard - the same frosted surface, the same C/ community
 * identity - so it reads as a post in the stream, not a widget dropped into it.
 *
 * Entering (and editing an already-open pick - see enterPrediction's own comment on how that
 * actually works now) happens right here through PredictionEntry, which owns the real guess UI and
 * calls the same endpoint the community's own Predictions tab uses - one entry path, not two.
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
  // viewer enters or edits, so the feed never has to refetch to show back what they just picked.
  const [entered, setEntered] = useState<{ guess: PredictionGuess | null; label: string | null } | null>(
    prediction.hasEntered ? { guess: prediction.myGuess, label: prediction.myGuessLabel } : null,
  );
  const [editing, setEditing] = useState(false);
  const raceAt = prediction.raceDate ? parseUtcDateTime(prediction.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const closed = !!raceAt && raceAt <= now;
  const urgent = !!raceAt && raceAt > now && raceAt - now < 24 * 60 * 60 * 1000;
  const resolved = prediction.status === "resolved";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="rounded-xl border border-white/[0.06] bg-[var(--f1-carbon)]/50 px-3 py-2.5 transition hover:border-white/[0.12]"
    >
      <div className="flex items-center gap-2">
        {showGroup ? (
          <Link href={groupHref(prediction.groupId)} className="flex min-w-0 items-center gap-2 transition hover:opacity-80">
            <EntityAvatar imageUrl={null} name={prediction.groupName} seed={prediction.groupId} size={22} />
            <span className="min-w-0 truncate text-[13px] font-medium text-neutral-200">{prediction.groupName}</span>
          </Link>
        ) : (
          <span className="text-[13px] font-medium text-neutral-200">Prediction round</span>
        )}
        <span aria-hidden className="shrink-0 text-neutral-700">
          ·
        </span>
        <span className="shrink-0 text-[11px] text-neutral-500">{timeAgo(prediction.createdAt)}</span>
        <span className="ml-auto shrink-0 rounded-md bg-[var(--f1-red)]/10 px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--f1-red)]/90">Prediction</span>
      </div>

      {/* The market itself is the headline - the race is context underneath it, not a second bold
          title. A community running several rounds for the same race (winner, podium, pole) used
          to render three cards with an identical, oversized race name and nothing but a small
          metadata line to tell them apart. */}
      <p className="mt-2 text-[14px] font-semibold leading-snug text-white">{marketTitle[prediction.type]}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-neutral-500">{prediction.raceName}</p>

      {/* Cost, real entry count and deadline - one compact row, not three stacked blocks. entryCount
          is a real group_prediction_entries count, never a placeholder - a round with zero entries
          says so plainly rather than a generic "not enough responses yet". */}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-tight text-neutral-500">
        <span className="font-medium tabular-nums text-neutral-300">{prediction.entryPoints} pts</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{prediction.entryCount === 0 ? "No entries yet" : `${prediction.entryCount} ${prediction.entryCount === 1 ? "entry" : "entries"}`}</span>
        {countdown ? (
          <>
            <span aria-hidden>·</span>
            <span className={`tabular-nums ${urgent ? "font-semibold text-[var(--f1-red)]" : ""}`}>{countdown} left</span>
          </>
        ) : closed && !resolved ? (
          <>
            <span aria-hidden>·</span>
            <span>closed, awaiting result</span>
          </>
        ) : null}
      </p>

      {!resolved && <PredictionTrendBars groupId={prediction.groupId} predictionId={prediction.id} isPodium={prediction.type === "podium"} />}

      <div className="mt-2">
        {resolved ? (
          <ResolvedResult prediction={prediction} drivers={drivers} />
        ) : editing ? (
          <PredictionEntry
            groupId={prediction.groupId}
            predictionId={prediction.id}
            type={prediction.type}
            entryPoints={prediction.entryPoints}
            drivers={drivers}
            closed={closed}
            initialGuess={entered?.guess ?? null}
            onEntered={(guess, label) => {
              setEntered({ guess, label });
              setEditing(false);
            }}
            onCancelEdit={() => setEditing(false)}
          />
        ) : entered ? (
          <EnteredSummary type={prediction.type} guess={entered.guess} drivers={drivers} closed={closed} onEdit={() => setEditing(true)} />
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

/** Entered and still resolvable - a small inline indicator (never a full-width banner) plus the
 * actual pick, with an "Edit pick" action only once the round is genuinely still open for it
 * (enterPrediction now updates an existing pick in place - see its own comment - so this action
 * really works, not just appears to). Closed-awaiting-result shows the same pick with no edit
 * action at all, matching the real state: nothing can be changed once the race has started. */
function EnteredSummary({
  type,
  guess,
  drivers,
  closed,
  onEdit,
}: {
  type: PredictionType;
  guess: PredictionGuess | null;
  drivers: DriverOption[];
  closed: boolean;
  onEdit: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <CheckIcon className="shrink-0 text-emerald-400" />
        <span className="text-[11px] font-medium text-emerald-400">{closed ? "Entered · awaiting result" : "Entered"}</span>
        {!closed && (
          <button type="button" onClick={onEdit} className="ml-auto shrink-0 text-[11px] font-medium text-neutral-400 transition hover:text-white">
            Edit pick
          </button>
        )}
      </div>
      {guess !== null && (
        <div className="mt-1.5">
          <GuessSummary type={type} guess={guess} drivers={drivers} />
        </div>
      )}
    </div>
  );
}

/** The round's real, final outcome - `correctAnswer`/`myPointsAwarded` are only ever set once
 * `resolvePrediction` has actually run (see groupPredictions.ts), so this never guesses at a result
 * ahead of the real one. The personal verdict is the real payout figure, not a binary
 * correct/incorrect label - a podium guess can score partial credit (right driver, wrong slot),
 * which "Incorrect" would misrepresent; `+N pts` / `-{entryPoints} pts` matches the exact sign
 * convention the community's own Predictions tab (PredictionCard.tsx) already uses for this. */
function ResolvedResult({ prediction, drivers }: { prediction: FeedPrediction; drivers: DriverOption[] }) {
  const scored = (prediction.myPointsAwarded ?? 0) > 0;
  return (
    <div>
      {prediction.correctAnswer !== null && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">Result</p>
          <div className="mt-1">
            <GuessSummary type={prediction.type} guess={prediction.correctAnswer} drivers={drivers} />
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        {prediction.hasEntered ? (
          <span className={`text-[11px] font-semibold ${scored ? "text-emerald-400" : "text-neutral-400"}`}>
            {scored ? `+${prediction.myPointsAwarded} pts` : `-${prediction.entryPoints} pts`}
          </span>
        ) : (
          <span className="text-[11px] text-neutral-500">You didn&apos;t enter this round.</span>
        )}
        <Link href={`${groupHref(prediction.groupId)}?tab=predictions`} className="ml-auto shrink-0 text-[11px] font-medium text-neutral-400 transition hover:text-white">
          View results →
        </Link>
      </div>
    </div>
  );
}

/** The actual pick or result, position-labeled for a podium round rather than a single
 * comma-joined string ("Lewis Hamilton, Kimi Antonelli, Alexander Albon" says WHO but not which
 * slot each was for) - one compact row per position, each with a real portrait where the roster
 * has one (see races.ts's getDriverHeadshotsByCode; a departed driver falls back to EntityAvatar's
 * own initials). A single-driver round (winner/pole/fastest_lap) gets one row and no position
 * label; dnf_count has no driver at all, just the real number. */
function GuessSummary({ type, guess, drivers }: { type: PredictionType; guess: PredictionGuess; drivers: DriverOption[] }) {
  if (type === "dnf_count") {
    const n = Number(guess);
    return (
      <p className="text-[12.5px] font-medium text-neutral-200">
        {n} {n === 1 ? "retirement" : "retirements"}
      </p>
    );
  }
  const codes = type === "podium" && Array.isArray(guess) ? guess : [String(guess)];
  const positionLabels = type === "podium" ? (["P1", "P2", "P3"] as const) : null;
  return (
    <div className="space-y-1">
      {codes.map((code, i) => {
        const driver = drivers.find((d) => d.code === code);
        return (
          <div key={`${code}-${i}`} className="flex items-center gap-1.5">
            {positionLabels && <span className="w-5 shrink-0 font-mono text-[10px] font-semibold text-neutral-500">{positionLabels[i]}</span>}
            <EntityAvatar imageUrl={driver?.headshotUrl ?? null} name={driver?.name ?? code} seed={code} size={18} />
            <span className="min-w-0 truncate text-[12.5px] font-medium text-neutral-200">{driver?.name ?? code}</span>
          </div>
        );
      })}
    </div>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" width="10" height="10" fill="none" aria-hidden className={className}>
      <path d="m2.8 7.4 2.6 2.6 5.8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
