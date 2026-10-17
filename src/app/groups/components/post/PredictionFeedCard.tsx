"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Check, Clock, Lock, Sparkles, X } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { DriverPicker } from "@/components/ui/F1Pickers";
import { ensureVisible } from "@/lib/colorContrast";
import { teamColor } from "@/lib/teamColors";
import { Icon } from "@/components/ui/Icon";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { predictionStateAt, type PredictionGuess, type PredictionType } from "@/lib/groupPredictionTypes";
import type { FeedPrediction, PredictionTrend } from "@/lib/supabase/groupPredictions";
import { groupHref } from "@/lib/routes";
import { formatCountdown } from "@/lib/countdown";
import { timeAgo } from "@/lib/format";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useAuth } from "@/providers/AuthProvider";
import { askApex } from "@/components/apex/askApex";
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

/** What "Ask Apex" asks for each kind of round: a general F1 question about this race. */
const APEX_QUESTION: Record<PredictionType, (race: string) => string> = {
  winner: (race) => `Who is most likely to win the ${race}, and why?`,
  podium: (race) => `Who is likely to finish on the podium at the ${race}?`,
  fastest_lap: (race) => `Who is likely to set the fastest lap at the ${race}?`,
  pole: (race) => `Who is likely to take pole position at the ${race}?`,
  dnf_count: (race) => `How many retirements should we expect at the ${race}?`,
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
  showGroup,
  drivers = [],
  groupAvatarUrl = null,
  modelPicks,
}: {
  prediction: FeedPrediction;
  /** Position in the feed (kept for callers; the feed no longer staggers entrances). */
  index?: number;
  showGroup: boolean;
  /** Real roster for THIS round's race. Empty is a real state, and the card says so. */
  drivers?: DriverOption[];
  /** The community's own picture, for the header. */
  groupAvatarUrl?: string | null;
  /** The pole model's top three for this race (pole rounds only, where the pipeline has run it). */
  modelPicks?: string[];
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

  const lastName = (code: string) => {
    const full = drivers.find((d) => d.code === code)?.name;
    return full ? full.split(" ").slice(-1)[0] : code;
  };
  // Under three hours left is when "when" stops being background information (the critique's warning threshold).
  const closingSoon = !closed && lockMs !== null && lockMs - now < 3 * 3600 * 1000;

  return (
    // One frosted pane, no inner borders (critique §4.2): the round is the one boxed item in a feed of unboxed
    // posts, which is what marks it out as something to act on.
    <article className="@container rounded-card p-4 surface-frost sm:p-5">
      {/* Context: where the round is running, for which race, and when it was opened. */}
      <p className="flex min-w-0 items-center gap-1.5 text-body-sm text-secondary">
        {showGroup && (
          <Link href={groupHref(prediction.groupId)} className="flex min-w-0 shrink items-center gap-2 rounded-control font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            <EntityAvatar imageUrl={groupAvatarUrl} name={prediction.groupName} seed={prediction.groupId} size={20} />
            <span className="truncate">{prediction.groupName}</span>
          </Link>
        )}
        {showGroup && <Dot tight />}
        <span className="truncate">{prediction.raceName}</span>
        <Dot tight />
        <span suppressHydrationWarning className="shrink-0 whitespace-nowrap">
          {timeAgo(prediction.createdAt)}
        </span>
      </p>

      {/* The question names the type, so there's no separate type badge. */}
      <h3 className="mt-3 text-title-md text-primary">{QUESTION[prediction.type]}</h3>

      {/* State and stakes on one line, the figures in the primary tone so the eye finds them: when it closes, what
          it costs, what it pays. Open isn't badged; only the last three hours turn the deadline amber. */}
      <p className="mt-1.5 flex flex-wrap items-center gap-y-1 text-body-sm text-secondary">
        {resolved ? (
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={Check} size={16} className="text-tertiary" />
            Settled on the official result
          </span>
        ) : countdown ? (
          <span suppressHydrationWarning className={`inline-flex items-center gap-1.5 tabular ${closingSoon ? "text-warning" : ""}`}>
            <Icon icon={Clock} size={16} className={closingSoon ? "" : "text-tertiary"} />
            Closes in <span className={`font-medium ${closingSoon ? "" : "text-primary"}`}>{countdown}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={Lock} size={16} className="text-tertiary" />
            Closed at qualifying
          </span>
        )}
        <Dot />
        <span className="tabular">
          Entry <span className="font-medium text-primary">{prediction.entryPoints} pts</span>
        </span>
        {!resolved && (
          <>
            <Dot />
            <span className="tabular">
              {isPodium ? "Pays up to " : "Pays "}
              <span className="font-medium text-primary">{winPoints} pts</span>
            </span>
          </>
        )}
      </p>

      <div className="mt-4">
        {isPodium ? (
          <PodiumMarket
            drivers={drivers}
            picking={picking}
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
            picking={picking}
            selected={picking ? (choice ?? entered?.guess ?? null) : null}
            entered={entered?.guess ?? null}
            correct={resolved ? prediction.correctAnswer : null}
            onSelect={setChoice}
          />
        )}
      </div>

      {/* Your row: where you stand on the left, the one action on the right. */}
      <div className="mt-4 flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-body-sm text-secondary">
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
          ) : entered && !editing ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Icon icon={Check} size={16} className="shrink-0 text-success" />
              <span className="truncate">
                Your pick <span className="font-medium text-primary">{typeof entered.guess === "string" ? lastName(entered.guess) : Array.isArray(entered.guess) ? entered.guess.map(lastName).join(" · ") : (entered.label ?? "")}</span>
              </span>
            </span>
          ) : closed ? (
            prediction.lockAt === null ? DEADLINE_UNKNOWN_MESSAGE : CLOSED_MESSAGE
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
        {!resolved && picking && (
          <div className="flex items-center gap-2">
            {editing && (
              <Button variant="ghost" size="md" onClick={() => (setEditing(false), setChoice(null))}>
                Cancel
              </Button>
            )}
            <Button variant="primary" size="md" loading={saving} disabled={!changed || !!blocker} onClick={() => void confirm()}>
              {entered ? "Save change" : `Enter · ${prediction.entryPoints} pts`}
            </Button>
          </div>
        )}
        {!resolved && !picking && entered && !closed && (
          <Button variant="ghost" size="md" onClick={() => setEditing(true)}>
            Change
          </Button>
        )}
      </div>
      {(blocker || error) && <p role="alert" className="mt-2 text-body-sm text-warning">{blocker ?? error}</p>}
      {/* Apex, after the task and quieter than it: the model's own pick where one exists before qualifying (the pole
          model; the race simulation only runs after it, when the round has closed), and a way to ask about the round.
          Marked as AI by its icon and name. */}
      {!resolved && (
        <div className="mt-3 flex items-center gap-1.5 text-caption text-tertiary">
          <Icon icon={Sparkles} size={16} className="size-3.5 shrink-0" />
          <p className="min-w-0 flex-1 truncate">
            {modelPicks?.length ? (
              <>
                Apex model&apos;s pole pick <span className="font-medium text-secondary">{lastName(modelPicks[0])}</span>
                {modelPicks.length > 1 && <>, then {modelPicks.slice(1).map(lastName).join(" and ")}</>}
              </>
            ) : (
              "Not sure? Apex can talk you through this race."
            )}
          </p>
          <button
            type="button"
            onClick={() => askApex(APEX_QUESTION[prediction.type](prediction.raceName), "everything")}
            className="-my-1.5 shrink-0 rounded-control px-1.5 py-1.5 font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Ask Apex
          </button>
        </div>
      )}
    </article>
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
    "relative flex h-12 min-w-0 items-center gap-2 rounded-control px-3 text-left transition-[background-color,box-shadow,opacity] duration-fast disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";
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
      <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: bar }} />
      <EntityAvatar imageUrl={driver?.headshotUrl ?? null} name={driver?.name ?? code} size={24} />
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
