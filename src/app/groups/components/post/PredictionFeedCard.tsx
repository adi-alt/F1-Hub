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
import { timeAgo } from "@/lib/format";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { PredictionEntry, type DriverOption } from "./PredictionEntry";

/** "Podium" (predictionTypeLabels' own short label, used for the header's own small badge) ->
 * "Predict the podium" (the actual focal question, longer and more specific) - both derived from
 * the round's real `type`, never a hardcoded string repeated identically on every card. There is
 * no separate "question" text anywhere in the schema (a round is just a race + a type + an entry
 * cost - see groupPredictionTypes.ts); this is the honest equivalent. */
const marketTitle: Record<PredictionType, string> = {
  winner: "Predict the race winner",
  podium: "Predict the podium",
  fastest_lap: "Predict the fastest lap",
  pole: "Predict pole position",
  dnf_count: "Predict the number of DNFs",
};

/** One compact, aligned metadata token - cost, entry count, deadline - instead of the same three
 * facts run together as a single flowing sentence. `accent` is used for the one fact that's ever
 * genuinely urgent (a deadline under 24h); nothing else competes with it for attention. */
function MetaChip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`rounded bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums ${accent ? "text-[var(--f1-red)]" : "text-neutral-300"}`}>
      {children}
    </span>
  );
}

/**
 * A prediction round, rendered in the feed alongside discussions rather than hidden behind a
 * community's own Predictions tab - open, closed-awaiting-result, or (for a little while after an
 * admin resolves it, see listMyPredictions' own comment) resolved with a real outcome.
 *
 * The composition, top to bottom: a compact identity line (community, post age, and the round's
 * own type as one small badge - not floated off in a far corner competing with the community
 * name), the actual question as the one focal line with the race as small context under it, one
 * row of metadata tokens, the community's own trend (while there's a real one to show), and
 * finally the part that actually changes by state - a submitted pick, an entry form, or a real
 * result - with exactly one action next to it, not stranded at the opposite edge of the card.
 *
 * Entering (and editing an already-open pick - see enterPrediction's own comment on how that
 * actually works) happens right here through PredictionEntry, which owns the real guess UI and
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
      {/* Identity line - community, post age, and the round's own type as one small badge that
          sits right beside them, part of the same sentence rather than floated to the far corner
          on its own. */}
      <div className="flex min-w-0 items-center gap-1.5">
        {showGroup ? (
          <Link href={groupHref(prediction.groupId)} className="flex min-w-0 items-center gap-1.5 transition hover:opacity-80">
            <EntityAvatar imageUrl={null} name={prediction.groupName} seed={prediction.groupId} size={20} />
            <span className="min-w-0 truncate text-[12.5px] font-medium text-neutral-200">{prediction.groupName}</span>
          </Link>
        ) : (
          <span className="min-w-0 truncate text-[12.5px] font-medium text-neutral-200">Prediction round</span>
        )}
        <span aria-hidden className="shrink-0 text-neutral-700">
          ·
        </span>
        <span className="shrink-0 text-[11px] text-neutral-500">{timeAgo(prediction.createdAt)}</span>
        <span className="shrink-0 rounded bg-[var(--f1-red)]/[0.08] px-1.5 py-[1px] text-[10px] font-medium text-[var(--f1-red)]/85">
          {predictionTypeLabels[prediction.type]}
        </span>
      </div>

      {/* The question is the one focal line; the race is context underneath it, small and
          readable but never competing with it. Neither repeats anywhere else on the card. */}
      <p className="mt-2 text-[14.5px] font-semibold leading-tight text-white">{marketTitle[prediction.type]}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-neutral-500">{prediction.raceName}</p>

      {/* Cost, real entry count, deadline - three aligned tokens, not one long sentence.
          entryCount is a real group_prediction_entries count, never a placeholder. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <MetaChip>{prediction.entryPoints} pts</MetaChip>
        <MetaChip>{prediction.entryCount === 0 ? "No entries" : `${prediction.entryCount} ${prediction.entryCount === 1 ? "entry" : "entries"}`}</MetaChip>
        {countdown ? <MetaChip accent={urgent}>{countdown} left</MetaChip> : closed && !resolved ? <MetaChip>Closed</MetaChip> : null}
      </div>

      {!resolved && <PredictionTrendBars groupId={prediction.groupId} predictionId={prediction.id} isPodium={prediction.type === "podium"} />}

      <div className="mt-2.5">
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
          <EnteredAnswer type={prediction.type} guess={entered.guess} drivers={drivers} closed={closed} onEdit={() => setEditing(true)} />
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

/** Entered and still resolvable - a small check and "Prediction submitted", not a green banner,
 * with "Edit" sitting directly beside it (not pushed to the opposite edge of the card) when the
 * round is still genuinely open for it - enterPrediction now updates an existing pick in place
 * (see its own comment), so this action really works, not just appears to. Closed-awaiting-result
 * shows the same pick with no edit action at all: nothing can change once the race has started. */
function EnteredAnswer({
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
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <CheckIcon className="shrink-0 text-emerald-400" />
          <span className="text-[11px] font-medium text-neutral-300">Prediction submitted</span>
        </span>
        {!closed && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded text-[11px] font-medium text-neutral-500 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
          >
            Edit
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
          <p className="text-[10.5px] font-medium text-neutral-500">Result</p>
          <div className="mt-1">
            <GuessSummary type={prediction.type} guess={prediction.correctAnswer} drivers={drivers} />
          </div>
        </div>
      )}
      <div className={`flex items-center gap-2 ${prediction.correctAnswer !== null ? "mt-2" : ""}`}>
        {prediction.hasEntered ? (
          <span className={`text-[11px] font-semibold ${scored ? "text-emerald-400" : "text-neutral-400"}`}>
            {scored ? `+${prediction.myPointsAwarded} pts` : `-${prediction.entryPoints} pts`}
          </span>
        ) : (
          <span className="text-[11px] text-neutral-500">You didn&apos;t enter this round.</span>
        )}
        <Link href={`${groupHref(prediction.groupId)}?tab=predictions`} className="text-[11px] font-medium text-neutral-500 transition hover:text-white">
          View results
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
    <div className="space-y-0.5">
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
