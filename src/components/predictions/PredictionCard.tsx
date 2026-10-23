"use client";

import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import Link from "next/link";
import { useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Check, Clock, Lock, Sparkles, Users, X } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DriverPicker } from "@/components/ui/F1Pickers";
import { ensureVisible } from "@/lib/colorContrast";
import { teamColor } from "@/lib/teamColors";
import { Icon } from "@/components/ui/Icon";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { PANEL } from "@/components/ui/panel";
import { comparableDriver, type ModelPick } from "@/lib/communityWeekend";
import {
  predictionCardState,
  type GroupPrediction,
  type PredictionCardState,
  type PredictionGuess,
  type PredictionTrend,
  type PredictionType,
} from "@/lib/groupPredictionTypes";
import { groupHref } from "@/lib/routes";
import { formatCountdown } from "@/lib/countdown";
import { timeAgo } from "@/lib/format";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useAuth } from "@/providers/AuthProvider";
import { askApex } from "@/components/apex/askApex";

/** A driver a round can be entered on; `team` colours the identity's team bar. */
export type DriverOption = { code: string; name: string; headshotUrl: string | null; team?: string };

/** Below this many entries there is no consensus to draw - two entries would read as "the
 * community thinks X" on the strength of two people. */
export const MIN_ENTRIES_FOR_TREND = 3;

/** Everything a card renders. The feed's listing (FeedPrediction) is exactly this; a community's
 * Predictions tab converts its rows with fromGroupPrediction. */
export type PredictionCardData = Omit<GroupPrediction, "myEntry"> & {
  groupName: string;
  hasEntered: boolean;
  myGuess: PredictionGuess | null;
  myGuessLabel: string | null;
  myPointsAwarded: number | null;
  correctAnswerLabel: string | null;
};

export function fromGroupPrediction(p: GroupPrediction, groupName: string): PredictionCardData {
  const { myEntry, ...round } = p;
  return { ...round, groupName, hasEntered: myEntry !== null, myGuess: myEntry?.guess ?? null, myGuessLabel: null, myPointsAwarded: myEntry?.pointsAwarded ?? null, correctAnswerLabel: null };
}

/** Where a card is shown, which decides what its context line repeats: the feed names the
 * community and the race; a community's own tab only the race; the race page only the community. */
export type PredictionCardVariant = "feed" | "community" | "race";

/** The question each round asks, from its real type. */
const QUESTION: Record<PredictionType, string> = {
  winner: "Who wins the race?",
  podium: "Call the podium",
  fastest_lap: "Who sets the fastest lap?",
  pole: "Who takes pole?",
  dnf_count: "How many retirements?",
};

/** What "Ask Apex" asks for each kind of round: a general F1 question about this race. */
const APEX_QUESTION: Record<PredictionType, (race: string) => string> = {
  winner: (race) => `Who is most likely to win the ${race}, and why?`,
  podium: (race) => `Who is likely to finish on the podium at the ${race}?`,
  fastest_lap: (race) => `Who is likely to set the fastest lap at the ${race}?`,
  pole: (race) => `Who is likely to take pole position at the ${race}?`,
  dnf_count: (race) => `How many retirements should we expect at the ${race}?`,
};

/** What a closed or blocked round says, per card state (open and resolved say nothing here). */
function stateMessage(state: PredictionCardState, p: PredictionCardData, pointsBalance: number | null): string | null {
  switch (state) {
    case "locked":
      return p.lockAt === null ? "This round's deadline isn't available yet, so it can't take entries right now." : "Predictions closed when qualifying began.";
    case "awaiting_result":
      return "This race has run. Waiting for an admin to settle the round.";
    case "void":
      return p.hasEntered ? "This round was voided. Your entry points were refunded." : "This round was voided.";
    case "insufficient_points":
      return `You need ${p.entryPoints} points to enter. You have ${pointsBalance ?? 0}.`;
    case "not_member":
      return "Join this community to enter its rounds.";
    case "no_lineup":
      return "No driver line-up is available yet for this race.";
    default:
      return null;
  }
}

/** How many option tiles a single-driver round shows before "Someone else" (the full grid is one picker away). */
const TILES = 6;
const DNF_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7];

const sameGuess = (a: PredictionGuess | null | undefined, b: PredictionGuess | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * One prediction round, wherever it's shown (the feed, a community's Predictions tab, the race
 * page), laid out like a market: the context, the question, the options as tiles with the
 * community's share of each, and a slip-style footer with the cost, what a right pick pays (double,
 * the resolve function's rule) and the one action.
 *
 * What the card can do comes from predictionCardState - computed by the server when it built the
 * listing (`viewerState`) and re-run here with the minute clock, the live points balance and the
 * roster, so a round closes at its deadline without a refresh. The server stays the authority: a
 * refusal it sends back as closed closes the card. Admins get Resolve and Void on unsettled rounds.
 *
 * The community trend comes in as a prop, fetched once for every card on screen
 * (usePredictionTrends), never per card. Wording stays clear of betting language: these are
 * points, not money.
 */
export function PredictionCard({
  variant,
  prediction,
  trend = null,
  drivers = [],
  groupAvatarUrl = null,
  modelPick = null,
  isMember = true,
  canManage = false,
  pointsBalance: serverBalance,
  onChanged,
}: {
  variant: PredictionCardVariant;
  prediction: PredictionCardData;
  /** The community's split of picks, from the batched trend request; null while loading or unavailable. */
  trend?: PredictionTrend | null;
  /** Real roster for THIS round's race. Empty is a real state, and the card says so. */
  drivers?: DriverOption[];
  /** The community's own picture, for the header. */
  groupAvatarUrl?: string | null;
  /** The Apex model's pick for this round, where its model has run for the race (see modelPickFor). */
  modelPick?: ModelPick | null;
  isMember?: boolean;
  /** A community admin: may resolve (pay out) or void (refund) an unsettled round. */
  canManage?: boolean;
  /** The viewer's balance as the server rendered it; the live header balance when not given. */
  pointsBalance?: number | null;
  /** After an entry, resolve or void, so the page can refresh what it shows around the card. */
  onChanged?: () => void;
}) {
  const now = useMinuteClock();
  const { pointsBalance: liveBalance, refreshPointsBalance } = useAuth();
  const pointsBalance = serverBalance ?? liveBalance;
  const [entered, setEntered] = useState<{ guess: PredictionGuess | null; label: string | null } | null>(prediction.hasEntered ? { guess: prediction.myGuess, label: prediction.myGuessLabel } : null);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<PredictionGuess | null>(null);
  const [podium, setPodium] = useState<[string, string, string]>(Array.isArray(prediction.myGuess) ? (prediction.myGuess as [string, string, string]) : ["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // The server's refusal as closed covers the up-to-a-minute the clock can lag the deadline.
  const [serverClosed, setServerClosed] = useState(false);

  const computed = predictionCardState(
    prediction,
    { isMember, hasEntered: entered !== null, pointsBalance, driverCount: drivers.length },
    now,
  );
  // The server's own verdict can only make a round more closed than the client clock thinks.
  const serverSettled = prediction.viewerState === "resolved" || prediction.viewerState === "void" ? prediction.viewerState : null;
  const state: PredictionCardState = serverSettled ?? (serverClosed && computed === "open" ? "locked" : computed);
  const resolved = state === "resolved";
  const settled = resolved || state === "void";
  const closed = state === "locked" || state === "awaiting_result" || settled;
  const lockMs = prediction.lockAt ? Date.parse(prediction.lockAt) : null;
  const countdown = !closed && lockMs !== null ? formatCountdown(lockMs, now) : null;
  const shownTrend = trend && trend.total >= MIN_ENTRIES_FOR_TREND ? trend : null;

  const picking = !closed && (!entered || editing);
  const isPodium = prediction.type === "podium";
  const winPoints = prediction.entryPoints * 2;
  const pending: PredictionGuess | null = isPodium ? (podium.every(Boolean) && new Set(podium).size === 3 && picking ? podium : null) : picking ? choice : null;
  const changed = pending !== null && !sameGuess(pending, entered?.guess);
  const blocked = state === "insufficient_points" || state === "not_member" || state === "no_lineup";
  const message = stateMessage(state, prediction, pointsBalance);

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
    onChanged?.();
  }

  /** Resolve (pay out) or void (refund everyone): both move points, so both refresh the balance. */
  async function settle(action: "resolve" | "void") {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/groups/${prediction.groupId}/predictions/${prediction.id}/${action}`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setSaving(false);
    if (!res?.ok) {
      setError(body?.error ?? (action === "resolve" ? "Couldn't resolve this round yet." : "Couldn't void this round. Try again."));
      return;
    }
    refreshPointsBalance();
    onChanged?.();
  }

  const lastName = (code: string) => {
    const full = drivers.find((d) => d.code === code)?.name;
    return full ? full.split(" ").slice(-1)[0] : code;
  };
  // Under three hours left is when "when" stops being background information (the critique's warning threshold).
  const closingSoon = !closed && lockMs !== null && lockMs - now < 3 * 3600 * 1000;
  const showGroup = variant !== "community";
  const showRace = variant !== "race";

  return (
    // The site's glass panel, like every card in the feed; no inner borders (critique §4.2).
    <article className={`@container p-4 ${PANEL}`}>
      {/* Context: where the round is running, for which race, and when it was opened. */}
      <p className="flex min-w-0 items-center gap-1.5 text-caption text-secondary">
        {showGroup && (
          <Link href={groupHref(prediction.groupId)} className="flex min-w-0 shrink items-center gap-2 rounded-control font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            <EntityAvatar imageUrl={groupAvatarUrl} name={prediction.groupName} seed={prediction.groupId} size={16} />
            <span className="truncate">{prediction.groupName}</span>
          </Link>
        )}
        {showGroup && showRace && <Dot tight />}
        {showRace && <span className="truncate">{prediction.raceName}</span>}
        <Dot tight />
        <span suppressHydrationWarning className="shrink-0 whitespace-nowrap">
          {timeAgo(prediction.createdAt)}
        </span>
      </p>

      {/* The question names the type, so there's no separate type badge. */}
      <h3 className="mt-2 text-body font-semibold text-primary">{QUESTION[prediction.type]}</h3>

      {/* State and stakes on one line, the figures in the primary tone so the eye finds them: when it closes, what
          it costs, what it pays. Open isn't badged; only the last three hours turn the deadline amber. */}
      <p className="mt-1 flex flex-wrap items-center gap-y-1 text-caption text-secondary">
        {resolved ? (
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={Check} size={16} className="size-3.5 text-tertiary" />
            Settled on the official result
          </span>
        ) : state === "void" ? (
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={X} size={16} className="size-3.5 text-tertiary" />
            Voided
          </span>
        ) : countdown ? (
          <span suppressHydrationWarning className={`inline-flex items-center gap-1.5 tabular ${closingSoon ? "text-warning" : ""}`}>
            <Icon icon={Clock} size={16} className={`size-3.5 ${closingSoon ? "" : "text-tertiary"}`} />
            Closes in <span className={`font-medium ${closingSoon ? "" : "text-primary"}`}>{countdown}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={Lock} size={16} className="size-3.5 text-tertiary" />
            Closed at qualifying
          </span>
        )}
        <Dot />
        <span className="tabular">
          Entry <span className="font-medium text-primary">{prediction.entryPoints} pts</span>
        </span>
        {!settled && (
          <>
            <Dot />
            <span className="tabular">
              {isPodium ? "Pays up to " : "Pays "}
              <span className="font-medium text-primary">{winPoints} pts</span>
            </span>
          </>
        )}
      </p>

      <div className="mt-3">
        {isPodium ? (
          <PodiumMarket
            drivers={drivers}
            picking={picking && !blocked}
            podium={picking ? podium : ((entered?.guess as [string, string, string] | null) ?? podium)}
            onChange={setPodium}
            entered={entered?.guess as [string, string, string] | null}
            correct={resolved ? (prediction.correctAnswer as [string, string, string] | null) : null}
          />
        ) : (
          <OptionTiles
            layoutGroupId={`pick-${prediction.id}`}
            type={prediction.type}
            drivers={drivers}
            trend={shownTrend}
            picking={picking && !blocked}
            selected={picking ? (choice ?? entered?.guess ?? null) : null}
            entered={entered?.guess ?? null}
            correct={resolved ? prediction.correctAnswer : null}
            onSelect={setChoice}
          />
        )}
      </div>

      {resolved && <ProvenanceLine source="Official classification" status="settled from the race result" updated={dayLabel(prediction.resolvedAt)} />}

      {/* Your row: where you stand on the left, the one action on the right. */}
      <div className="mt-3 flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-caption text-secondary">
          {resolved ? (
            prediction.hasEntered ? (
              (prediction.myPointsAwarded ?? 0) > 0 ? (
                <span className="font-medium tabular text-success">Right call · +{prediction.myPointsAwarded} pts</span>
              ) : (
                <span className="tabular">Not this time · staked {prediction.entryPoints} pts</span>
              )
            ) : (
              "You didn't enter this round"
            )
          ) : entered && !editing && !settled ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Icon icon={Check} size={16} className="shrink-0 text-success" />
              <span className="truncate">
                Your pick <span className="font-medium text-primary">{typeof entered.guess === "string" ? lastName(entered.guess) : Array.isArray(entered.guess) ? entered.guess.map(lastName).join(" · ") : (entered.label ?? "")}</span>
              </span>
            </span>
          ) : closed ? (
            message
          ) : (
            <span className="tabular">
              {pending !== null && changed && (
                <>
                  Selected{" "}
                  <span className="font-medium text-primary">
                    {typeof pending === "string" ? lastName(pending) : Array.isArray(pending) ? pending.map(lastName).join(" · ") : `${pending} ${pending === 1 ? "retirement" : "retirements"}`}
                  </span>
                  <Dot />
                </>
              )}
              {prediction.entryCount} {prediction.entryCount === 1 ? "entry" : "entries"}
              {shownTrend && !isPodium && (
                <>
                  <Dot />% = this community&apos;s picks
                </>
              )}
            </span>
          )}
        </p>
        {picking && !blocked && (
          <div className="flex items-center gap-2">
            {editing && (
              <Button variant="ghost" size="sm" onClick={() => (setEditing(false), setChoice(null))}>
                Cancel
              </Button>
            )}
            <Button variant="primary" size="sm" loading={saving} disabled={!changed} onClick={() => void confirm()}>
              {entered ? "Save change" : `Enter · ${prediction.entryPoints} pts`}
            </Button>
          </div>
        )}
        {!picking && entered && !closed && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Change
          </Button>
        )}
      </div>
      {((picking && blocked && message) || error) && (
        <p role="alert" className="mt-2 text-body-sm text-warning">
          {error || message}
        </p>
      )}
      {/* Crowd vs Apex, after the task and quieter than it: where this community leans against the Apex model's pick,
          each marked right or wrong once the round is settled. Retirement rounds have no model. */}
      <CrowdVsApex
        type={prediction.type}
        trend={shownTrend}
        entryCount={prediction.entryCount}
        modelPick={modelPick}
        answer={resolved ? comparableDriver(prediction.type, prediction.correctAnswer) : null}
        closed={closed}
        nameOf={lastName}
        onAsk={() => askApex(APEX_QUESTION[prediction.type](prediction.raceName), "everything")}
      />
      {/* Resolving pays points out and voiding refunds them, so both stay admin-only. */}
      {canManage && !settled && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ConfirmButton onConfirm={() => void settle("resolve")} question="Resolve and pay out?" confirmLabel="Resolve" pending={saving}>
            Resolve this round
          </ConfirmButton>
          <ConfirmButton onConfirm={() => void settle("void")} question="Void it and refund every entry?" confirmLabel="Void" pending={saving}>
            Void
          </ConfirmButton>
        </div>
      )}
    </article>
  );
}

/** The crowd's pick against the Apex model's, one line. */
function CrowdVsApex({
  type,
  trend,
  entryCount,
  modelPick,
  answer,
  closed,
  nameOf,
  onAsk,
}: {
  type: PredictionType;
  trend: PredictionTrend | null;
  entryCount: number;
  modelPick: ModelPick | null;
  answer: string | null;
  closed: boolean;
  nameOf: (code: string) => string;
  onAsk: () => void;
}) {
  const top = trend?.options.find((o) => o.key !== "__other__") ?? null;
  const crowd = type === "dnf_count" ? (top ? top.label : null) : top ? top.key : null;
  const verdict = (pick: string | null) =>
    answer && pick ? (pick === answer ? <Icon icon={Check} size={16} className="size-3.5 text-success" aria-label="right" /> : <Icon icon={X} size={16} className="size-3.5 text-tertiary" aria-label="wrong" />) : null;
  const hasModel = type !== "dnf_count";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-secondary">
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon icon={Users} size={16} className="size-3.5 shrink-0 text-tertiary" />
        <span className="text-tertiary">Crowd</span>
        {crowd && top ? (
          <span className="flex items-center gap-1">
            <span className="font-semibold text-primary">{type === "dnf_count" ? crowd : nameOf(crowd)}</span>
            <span className="tabular">{top.pct}%</span>
            {verdict(type === "dnf_count" ? null : crowd)}
          </span>
        ) : (
          <span className="tabular">{entryCount ? `${entryCount} ${entryCount === 1 ? "entry" : "entries"} so far` : "no entries yet"}</span>
        )}
      </span>
      {hasModel && (
        <>
          <span aria-hidden className="text-tertiary">
            vs
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <Icon icon={Sparkles} size={16} className="size-3.5 shrink-0 text-tertiary" />
            <span className="text-tertiary">Apex</span>
            {modelPick ? (
              <span className="flex items-center gap-1">
                <span className="font-semibold text-primary">{nameOf(modelPick.driver)}</span>
                {verdict(modelPick.driver)}
              </span>
            ) : (
              <span>{closed ? "no pick" : "picks after qualifying"}</span>
            )}
          </span>
        </>
      )}
      <button
        type="button"
        onClick={onAsk}
        className="-my-1.5 ml-auto shrink-0 rounded-control px-1.5 py-1.5 font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        Ask Apex
      </button>
    </div>
  );
}

/** A separator dot: spaced for running text, or `tight` inside a row that already has a gap. */
function Dot({ tight = false }: { tight?: boolean }) {
  return (
    <span aria-hidden className={tight ? "text-tertiary" : "mx-1.5 text-tertiary"}>
      ·
    </span>
  );
}

type TileState = "idle" | "selected" | "entered" | "correct" | "wrong";

/** An outcome button, as on a market: a flat tile, no border at rest. Selection is a neutral white ring (red is kept
 * for the one Enter button); your entered or the right answer is the success ring; a wrong pick dims. */
function tileClass(state: TileState, interactive: boolean, dimWhenLocked = true) {
  const base =
    "relative flex h-10 min-w-0 items-center gap-2 rounded-control px-3 text-left transition-[background-color,box-shadow,opacity] duration-fast disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";
  switch (state) {
    case "selected":
      // The ring and the lift are <Selection />, which slides here from the previous choice.
      return `${base} bg-white/[0.05]`;
    case "entered":
    case "correct":
      return `${base} bg-success/10 ring-1 ring-inset ring-success/50`;
    case "wrong":
      return `${base} bg-white/[0.04] opacity-60`;
    default:
      // Not choosable right now (entered and not changing, or closed): the other options step back.
      return `${base} bg-white/[0.05] ${interactive ? "hover:bg-white/[0.09]" : dimWhenLocked ? "opacity-75" : ""}`;
  }
}

/** A driver inside a tile, on one line at any width: team bar, headshot, code, and the surname where the card is
 * wide enough (a container query, so it follows the card, not the window). Truncates rather than wraps, so every
 * tile keeps the same height. */
function TileDriver({ code, driver }: { code: string; driver?: DriverOption }) {
  const bar = driver?.team ? ensureVisible(teamColor(driver.team)) : "transparent";
  const surname = driver?.name.split(" ").slice(-1)[0];
  return (
    <span className="relative flex min-w-0 flex-1 items-center gap-2">
      <span aria-hidden className="h-5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: bar }} />
      <EntityAvatar imageUrl={driver?.headshotUrl ?? null} name={driver?.name ?? code} size={20} />
      <span className="min-w-0 truncate text-body-sm">
        <span className="font-semibold text-primary">{code}</span>
        {surname && <span className="ml-1.5 hidden text-secondary @sm:inline">{surname}</span>}
      </span>
    </span>
  );
}

/** The community's share of an option, as a hairline along the tile's foot: the size of the crowd at a glance. */
function ShareLine({ pct }: { pct: number }) {
  return (
    <motion.span
      aria-hidden
      className="absolute bottom-0 left-2 right-2 h-0.5 origin-left rounded-full bg-white/25"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: pct / 100 }}
      transition={{ type: "spring", stiffness: 120, damping: 22 }}
    />
  );
}

/** The selected option's ring and lift, as one element shared across the card's tiles (motion's layoutId): choosing
 * another option slides it there rather than switching one tile off and another on. */
function Selection() {
  return <motion.span aria-hidden layoutId="pick" className="absolute inset-0 rounded-control bg-white/[0.07] ring-1 ring-inset ring-white/60" transition={{ type: "spring", stiffness: 520, damping: 38 }} />;
}

/** Tiles give a little under the finger, like a button on a betting slip. */
const TAP = { scale: 0.97 };

/** A single-driver (or retirement-count) round's outcomes: the community's most-picked first, filled from the
 * race's line-up; any other driver is one picker away. Each shows the driver as everywhere else on the site (team
 * bar, headshot, code) and the share of the community's picks. */
function OptionTiles({
  layoutGroupId,
  type,
  drivers,
  trend,
  picking,
  selected,
  entered,
  correct,
  onSelect,
}: {
  /** Scopes the sliding selection to this card (one round's tiles never animate into another's). */
  layoutGroupId: string;
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
  const marker = (state: TileState, key: string) =>
    state === "correct" || state === "entered" ? (
      <Icon icon={Check} size={16} className="relative shrink-0 text-success" />
    ) : state === "wrong" ? (
      <Icon icon={X} size={16} className="relative shrink-0 text-tertiary" />
    ) : share.has(key) ? (
      <span title={`${share.get(key)}% of this community's picks`} className="relative shrink-0 text-body-sm font-medium tabular text-secondary">
        <RollingNumber value={share.get(key) ?? 0} suffix="%" />
      </span>
    ) : null;

  if (type === "dnf_count") {
    return (
      <LayoutGroup id={layoutGroupId}>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {DNF_OPTIONS.map((n) => {
            const state = stateFor(n, selected, entered, correct);
            return (
              <motion.button key={n} type="button" disabled={!picking} whileTap={picking ? TAP : undefined} aria-pressed={state === "selected" || state === "entered"} onClick={() => onSelect(n)} className={`${tileClass(state, picking)} justify-center`}>
                {state === "selected" && <Selection />}
                <span className="relative text-body font-semibold tabular text-primary">{n}</span>
                {share.has(String(n)) && <ShareLine pct={share.get(String(n)) ?? 0} />}
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>
    );
  }
  // A stable order, so choosing never reshuffles the tiles under the pointer: the community's favourites, then the
  // line-up, up to TILES; a pick, entry or answer from beyond that (chosen via "Another driver") is added at the end.
  const codes: string[] = [];
  const add = (c: unknown) => typeof c === "string" && c && !codes.includes(c) && codes.push(c);
  (trend?.options ?? []).forEach((o) => o.key !== "__other__" && codes.length < TILES && add(o.key));
  drivers.forEach((d) => codes.length < TILES && add(d.code));
  [correct, entered, selected].forEach(add);
  return (
    <div>
      <LayoutGroup id={layoutGroupId}>
        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3">
          {codes.map((code) => {
            const d = drivers.find((x) => x.code === code);
            const state = stateFor(code, selected, entered, correct);
            return (
              <motion.button key={code} type="button" disabled={!picking} whileTap={picking ? TAP : undefined} aria-pressed={state === "selected" || state === "entered"} aria-label={d?.name ?? code} onClick={() => onSelect(code)} className={tileClass(state, picking)}>
                {state === "selected" && <Selection />}
                <TileDriver code={code} driver={d} />
                {marker(state, code)}
                {share.has(code) && <ShareLine pct={share.get(code) ?? 0} />}
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>
      {picking && drivers.length > codes.length && (
        <div className="mt-2 @2xl:max-w-[calc((100%-1rem)/3)] @md:max-w-[calc((100%-0.5rem)/2)]">
          <DriverPicker drivers={drivers.filter((d) => !codes.includes(d.code))} value="" onChange={(code) => code && onSelect(code)} placeholder="Another driver…" ariaLabel="Pick another driver" />
        </div>
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

/** A podium round: P1, P2 and P3. While picking, three pickers in a row; otherwise the picked podium and, once
 * settled, which places were right. */
function PodiumMarket({
  drivers,
  picking,
  podium,
  onChange,
  entered,
  correct,
}: {
  drivers: DriverOption[];
  picking: boolean;
  podium: [string, string, string];
  onChange: (p: [string, string, string]) => void;
  entered: [string, string, string] | null;
  correct: [string, string, string] | null;
}) {
  const places = ["P1", "P2", "P3"] as const;
  if (picking) {
    const filled = podium.filter(Boolean);
    return (
      <div>
        <div className="grid gap-2 @2xl:grid-cols-3">
          {places.map((place, i) => (
            <div key={place} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-body-sm font-semibold tabular text-tertiary">{place}</span>
              <DriverPicker
                drivers={drivers}
                value={podium[i]}
                className="min-w-0 flex-1"
                ariaLabel={`${place}`}
                onChange={(code) => {
                  const next: [string, string, string] = [...podium];
                  next[i] = code;
                  onChange(next);
                }}
              />
            </div>
          ))}
        </div>
        {filled.length > 1 && new Set(filled).size !== filled.length && <p className="mt-2 text-body-sm text-warning">Pick three different drivers.</p>}
      </div>
    );
  }
  const shown = entered ?? podium;
  return (
    <ol className="grid gap-2 @2xl:grid-cols-3">
      {places.map((place, i) => {
        const code = shown[i];
        const right = correct ? correct[i] === code : null;
        const d = drivers.find((x) => x.code === code);
        return (
          // Your podium, read-only: shown at full strength (these are your picks, not options you can't take).
          <li key={place} className={tileClass(right === null ? "idle" : right ? "correct" : "wrong", false, false)}>
            <span className="w-6 shrink-0 text-body-sm font-semibold tabular text-tertiary">{place}</span>
            {code ? (
              <TileDriver code={code} driver={d} />
            ) : (
              <span className="text-body-sm text-tertiary">Not picked</span>
            )}
            {right === true && <Icon icon={Check} size={16} className="shrink-0 text-success" />}
            {right === false && correct && <span className="shrink-0 text-caption text-tertiary">{correct[i]}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function dayLabel(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
