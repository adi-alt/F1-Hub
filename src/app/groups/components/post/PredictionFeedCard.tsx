"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Trophy, X } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { DriverPicker } from "@/components/ui/F1Pickers";
import { Icon } from "@/components/ui/Icon";
import { predictionStateAt, predictionTypeLabels, type PredictionGuess, type PredictionType } from "@/lib/groupPredictionTypes";
import type { FeedPrediction, PredictionTrend } from "@/lib/supabase/groupPredictions";
import { groupHref } from "@/lib/routes";
import { formatCountdown } from "@/lib/countdown";
import { timeAgo } from "@/lib/format";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useAuth } from "@/providers/AuthProvider";
import { usePredictionTrend, MIN_ENTRIES_FOR_TREND } from "./PredictionTrendBars";
import { CLOSED_MESSAGE, DEADLINE_UNKNOWN_MESSAGE, type DriverOption } from "./PredictionEntry";

/** The question each round asks, from its real type. */
const QUESTION: Record<PredictionType, string> = {
  winner: "Who wins the race?",
  podium: "Call the podium",
  fastest_lap: "Who sets the fastest lap?",
  pole: "Who takes pole?",
  dnf_count: "How many retirements?",
};

/** How many option tiles a single-driver round shows before "Someone else" (the full grid is one picker away). */
const TILES = 6;
const DNF_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7];

const sameGuess = (a: PredictionGuess | null | undefined, b: PredictionGuess | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * A prediction round in the feed, laid out like a market on a prediction site: a header strip with the community,
 * the round and its countdown; the question; the options as tiles, each showing how much of the community has
 * picked it; and a slip-style footer with what it costs, what a right pick wins (a correct pick pays double, the
 * resolve function's own rule) and the one action.
 *
 * Picking is a tap on a tile (or "Someone else" for any driver), then Confirm - the same endpoint and checks the
 * community's Predictions tab uses (`POST .../enter`: membership, the wallet, the deadline). After entering, the
 * tile you picked stays marked and Change reopens the choice until qualifying; after the result, the right answer
 * is marked and the card says what you won. Wording stays clear of betting language: these are points, not money.
 */
export function PredictionFeedCard({
  prediction,
  index = 0,
  showGroup,
  drivers = [],
  groupAvatarUrl = null,
}: {
  prediction: FeedPrediction;
  index?: number;
  showGroup: boolean;
  /** Real roster for THIS round's race. Empty is a real state, and the card says so. */
  drivers?: DriverOption[];
  /** The community's own picture, for the header. */
  groupAvatarUrl?: string | null;
}) {
  const now = useMinuteClock();
  const { pointsBalance, refreshPointsBalance } = useAuth();
  const [entered, setEntered] = useState<{ guess: PredictionGuess | null; label: string | null } | null>(prediction.hasEntered ? { guess: prediction.myGuess, label: prediction.myGuessLabel } : null);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<PredictionGuess | null>(null);
  const [podium, setPodium] = useState<[string, string, string]>(Array.isArray(prediction.myGuess) ? (prediction.myGuess as [string, string, string]) : ["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // The server's deadline (start of qualifying, prediction.lockAt); `serverClosed` covers the up-to-a-minute the
  // clock can lag behind it.
  const [serverClosed, setServerClosed] = useState(false);
  const state = predictionStateAt(prediction.status, prediction.lockAt, now);
  const lockMs = prediction.lockAt ? Date.parse(prediction.lockAt) : null;
  const closed = serverClosed || state !== "open";
  const resolved = state === "resolved";
  const countdown = !closed && lockMs !== null ? formatCountdown(lockMs, now) : null;
  const urgent = !closed && lockMs !== null && lockMs - now < 24 * 3600 * 1000;
  const { trend } = usePredictionTrend(prediction.groupId, prediction.id, prediction.entryCount > 0);
  const shownTrend = trend && trend.total >= MIN_ENTRIES_FOR_TREND ? trend : null;

  const picking = !closed && (!entered || editing);
  const isPodium = prediction.type === "podium";
  const winPoints = prediction.entryPoints * 2;
  const pending: PredictionGuess | null = isPodium ? (podium.every(Boolean) && new Set(podium).size === 3 && picking ? podium : null) : picking ? choice : null;
  const changed = pending !== null && !sameGuess(pending, entered?.guess);
  const blocker = !picking
    ? null
    : prediction.type !== "dnf_count" && drivers.length === 0
      ? "No driver line-up is available yet for this race."
      : !entered && pointsBalance !== null && pointsBalance < prediction.entryPoints
        ? `You need ${prediction.entryPoints} points to enter. You have ${pointsBalance}.`
        : null;

  const nameOf = (code: string) => drivers.find((d) => d.code === code)?.name ?? code;
  const labelFor = (g: PredictionGuess) => (typeof g === "number" ? `${g} ${g === 1 ? "retirement" : "retirements"}` : Array.isArray(g) ? g.map(nameOf).join(", ") : nameOf(g));

  async function confirm() {
    if (pending === null || saving) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/groups/${prediction.groupId}/predictions/${prediction.id}/enter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess: pending }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string; code?: string } | null;
    setSaving(false);
    if (!res?.ok) {
      if (body?.code === "prediction_locked" || body?.code === "lock_unknown" || body?.code === "prediction_resolved") setServerClosed(true);
      setError(body?.error ?? "Couldn't save your pick. Try again.");
      return;
    }
    // Entering spends points: the header's balance is now stale.
    refreshPointsBalance();
    setEntered({ guess: pending, label: labelFor(pending) });
    setEditing(false);
    setChoice(null);
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.03, ease: [0.2, 0, 0, 1] }}
      className="overflow-hidden rounded-card border border-white/[0.08] bg-surface-1/70"
    >
      {/* The market's header strip: who's running it, which round, and how long it stays open. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/[0.06] bg-surface-2/40 px-4 py-2.5 text-caption">
        {showGroup ? (
          <Link href={groupHref(prediction.groupId)} className="flex min-w-0 items-center gap-2 rounded-control font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            <EntityAvatar imageUrl={groupAvatarUrl} name={prediction.groupName} seed={prediction.groupId} size={20} />
            <span className="truncate">{prediction.groupName}</span>
          </Link>
        ) : (
          <span className="font-semibold text-primary">Prediction round</span>
        )}
        <span aria-hidden className="text-tertiary">
          ·
        </span>
        <span suppressHydrationWarning className="text-tertiary">
          {timeAgo(prediction.createdAt)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-surface-3/70 px-2 py-0.5 font-medium text-secondary">
            <Icon icon={Trophy} size={16} className="size-3.5" />
            {predictionTypeLabels[prediction.type]}
          </span>
          {resolved ? (
            <span className="rounded-full bg-success/12 px-2 py-0.5 font-medium text-success">Settled</span>
          ) : countdown ? (
            <span suppressHydrationWarning className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular ${urgent ? "bg-warning/12 text-warning" : "bg-surface-3/70 text-secondary"}`}>
              <Icon icon={Clock} size={16} className="size-3.5" />
              {countdown}
            </span>
          ) : (
            <span className="rounded-full bg-surface-3/70 px-2 py-0.5 font-medium text-secondary">Closed</span>
          )}
        </span>
      </div>

      <div className="p-4">
        <p className="text-caption text-secondary">{prediction.raceName}</p>
        <p className="mt-0.5 text-body font-semibold text-primary">{QUESTION[prediction.type]}</p>

        <div className="mt-3">
          {isPodium ? (
            <PodiumMarket
              drivers={drivers}
              picking={picking}
              podium={picking ? podium : ((entered?.guess as [string, string, string] | null) ?? podium)}
              onChange={setPodium}
              entered={entered?.guess as [string, string, string] | null}
              correct={resolved ? (prediction.correctAnswer as [string, string, string] | null) : null}
              trend={shownTrend}
              nameOf={nameOf}
            />
          ) : (
            <OptionTiles
              type={prediction.type}
              drivers={drivers}
              trend={shownTrend}
              picking={picking}
              selected={picking ? (choice ?? entered?.guess ?? null) : null}
              entered={entered?.guess ?? null}
              correct={resolved ? prediction.correctAnswer : null}
              onSelect={setChoice}
            />
          )}
        </div>

        {/* The slip: cost, what a right pick wins, entries, and the one action. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] pt-3">
          <p className="min-w-0 flex-1 text-caption text-secondary">
            <span className="tabular text-primary">{prediction.entryPoints} pts</span> to enter
            <span aria-hidden className="text-tertiary"> · </span>
            {isPodium ? "up to " : "a right pick wins "}
            <span className="tabular font-semibold text-success">{winPoints} pts</span>
            <span aria-hidden className="text-tertiary"> · </span>
            <span className="tabular">
              {prediction.entryCount} {prediction.entryCount === 1 ? "entry" : "entries"}
            </span>
          </p>
          <div className="flex items-center gap-2">
            {resolved ? (
              prediction.hasEntered ? (
                <span className={`text-body-sm font-semibold tabular ${(prediction.myPointsAwarded ?? 0) > 0 ? "text-success" : "text-secondary"}`}>
                  {(prediction.myPointsAwarded ?? 0) > 0 ? `+${prediction.myPointsAwarded} pts` : `-${prediction.entryPoints} pts`}
                </span>
              ) : (
                <span className="text-caption text-tertiary">You didn&apos;t enter</span>
              )
            ) : picking ? (
              <>
                {editing && (
                  <Button variant="ghost" size="sm" onClick={() => (setEditing(false), setChoice(null))}>
                    Cancel
                  </Button>
                )}
                <Button variant="primary" size="sm" loading={saving} disabled={!changed || !!blocker} onClick={() => void confirm()}>
                  {entered ? "Update pick" : "Confirm pick"}
                </Button>
              </>
            ) : entered ? (
              <>
                <span className="flex items-center gap-1 text-caption font-medium text-success">
                  <Icon icon={Check} size={16} />
                  Your pick is in
                </span>
                {!closed && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                    Change
                  </Button>
                )}
              </>
            ) : (
              <span className="text-caption text-tertiary">{prediction.lockAt === null ? DEADLINE_UNKNOWN_MESSAGE : CLOSED_MESSAGE}</span>
            )}
          </div>
        </div>
        {(blocker || error) && <p className="mt-2 text-caption text-warning">{blocker ?? error}</p>}
      </div>
    </motion.article>
  );
}

type TileState = "idle" | "selected" | "entered" | "correct" | "wrong";

function tileClass(state: TileState, interactive: boolean) {
  const base = "relative flex h-11 min-w-0 items-center gap-2 rounded-control border px-2.5 text-left transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";
  switch (state) {
    case "selected":
      return `${base} border-brand bg-brand/12`;
    case "entered":
    case "correct":
      return `${base} border-success/60 bg-success/10`;
    case "wrong":
      return `${base} border-white/10 bg-surface-2/40 opacity-70`;
    default:
      return `${base} border-white/10 bg-surface-2/60 ${interactive ? "hover:border-white/25 hover:bg-surface-2" : ""}`;
  }
}

/** A single-driver (or retirement-count) round's options as tiles: the community's most-picked options first, each
 * with its share, filled from the race's line-up; any other driver is one picker away. */
function OptionTiles({
  type,
  drivers,
  trend,
  picking,
  selected,
  entered,
  correct,
  onSelect,
}: {
  type: PredictionType;
  drivers: DriverOption[];
  trend: PredictionTrend | null;
  picking: boolean;
  selected: PredictionGuess | null;
  entered: PredictionGuess | null;
  correct: PredictionGuess | null;
  onSelect: (g: PredictionGuess) => void;
}) {
  const share = new Map((trend?.options ?? []).filter((o) => o.key !== "__other__").map((o) => [o.key, o.pct]));
  if (type === "dnf_count") {
    return (
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {DNF_OPTIONS.map((n) => {
          const state = stateFor(n, selected, entered, correct);
          return (
            <button key={n} type="button" disabled={!picking} aria-pressed={state === "selected" || state === "entered"} onClick={() => onSelect(n)} className={`${tileClass(state, picking)} justify-center`}>
              <span className="text-body-sm font-semibold tabular text-primary">{n}</span>
              {share.has(String(n)) && <span className="text-caption tabular text-secondary">{share.get(String(n))}%</span>}
            </button>
          );
        })}
      </div>
    );
  }
  // The most-picked first, then the line-up; always including whatever is picked or was the answer.
  const codes: string[] = [];
  const add = (c: unknown) => typeof c === "string" && c && !codes.includes(c) && codes.push(c);
  [correct, entered, selected].forEach(add);
  (trend?.options ?? []).forEach((o) => o.key !== "__other__" && add(o.key));
  drivers.forEach((d) => codes.length < TILES && add(d.code));
  const shown = codes.slice(0, Math.max(TILES, codes.length));
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((code) => {
          const d = drivers.find((x) => x.code === code);
          const state = stateFor(code, selected, entered, correct);
          return (
            <button key={code} type="button" disabled={!picking} aria-pressed={state === "selected" || state === "entered"} onClick={() => onSelect(code)} className={tileClass(state, picking)}>
              <EntityAvatar imageUrl={d?.headshotUrl ?? null} name={d?.name ?? code} seed={code} size={24} />
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-primary">{d?.name ?? code}</span>
              {state === "correct" ? (
                <Icon icon={Check} size={16} className="shrink-0 text-success" />
              ) : state === "wrong" ? (
                <Icon icon={X} size={16} className="shrink-0 text-tertiary" />
              ) : share.has(code) ? (
                <span className="shrink-0 text-caption font-semibold tabular text-secondary">{share.get(code)}%</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {picking && drivers.length > TILES && (
        <div className="mt-2 max-w-xs">
          <DriverPicker drivers={drivers.filter((d) => !shown.includes(d.code))} value="" onChange={(code) => code && onSelect(code)} placeholder="Someone else…" ariaLabel="Pick another driver" />
        </div>
      )}
      {trend && (
        <p className="mt-2 text-caption text-tertiary">
          % = share of this community&apos;s {trend.total} {trend.total === 1 ? "pick" : "picks"}
        </p>
      )}
    </div>
  );
}

function stateFor(value: PredictionGuess, selected: PredictionGuess | null, entered: PredictionGuess | null, correct: PredictionGuess | null): TileState {
  if (correct !== null) return sameGuess(value, correct) ? "correct" : sameGuess(value, entered) ? "wrong" : "idle";
  if (selected !== null && sameGuess(value, selected)) return entered !== null && sameGuess(value, entered) ? "entered" : "selected";
  if (entered !== null && sameGuess(value, entered)) return "entered";
  return "idle";
}

/** A podium round: three places, each a driver; while picking, three pickers; otherwise the picked (and, once
 * settled, the real) podium. */
function PodiumMarket({
  drivers,
  picking,
  podium,
  onChange,
  entered,
  correct,
  trend,
  nameOf,
}: {
  drivers: DriverOption[];
  picking: boolean;
  podium: [string, string, string];
  onChange: (p: [string, string, string]) => void;
  entered: [string, string, string] | null;
  correct: [string, string, string] | null;
  trend: PredictionTrend | null;
  nameOf: (code: string) => string;
}) {
  const places = ["1st", "2nd", "3rd"] as const;
  const leader = trend?.options.find((o) => o.key !== "__other__");
  if (picking) {
    return (
      <div>
        <div className="grid gap-2 sm:grid-cols-3">
          {places.map((place, i) => (
            <label key={place} className="block text-caption text-secondary">
              {place}
              <DriverPicker
                drivers={drivers}
                value={podium[i]}
                className="mt-1"
                ariaLabel={`${place} place`}
                onChange={(code) => {
                  const next: [string, string, string] = [...podium];
                  next[i] = code;
                  onChange(next);
                }}
              />
            </label>
          ))}
        </div>
        {podium.filter(Boolean).length > 1 && new Set(podium.filter(Boolean)).size !== podium.filter(Boolean).length && <p className="mt-2 text-caption text-warning">Pick three different drivers.</p>}
        {leader && <p className="mt-2 text-caption text-tertiary">Most picked to win: {leader.label} ({leader.pct}%)</p>}
      </div>
    );
  }
  const shown = entered ?? podium;
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {places.map((place, i) => {
        const code = shown[i];
        const right = correct ? correct[i] === code : null;
        const d = drivers.find((x) => x.code === code);
        return (
          <li key={place} className={tileClass(right === null ? (code ? "entered" : "idle") : right ? "correct" : "wrong", false)}>
            <span className="w-7 shrink-0 text-caption font-semibold text-tertiary">{place}</span>
            {code ? (
              <>
                <EntityAvatar imageUrl={d?.headshotUrl ?? null} name={nameOf(code)} seed={code} size={24} />
                <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-primary">{nameOf(code)}</span>
                {correct && !right && <span className="shrink-0 text-caption text-tertiary">{nameOf(correct[i])}</span>}
              </>
            ) : (
              <span className="text-caption text-tertiary">Not picked</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
