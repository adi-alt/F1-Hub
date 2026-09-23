"use client";

import { useEffect, useState } from "react";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { predictionTypeLabels, type GroupPrediction, type PredictionGuess, type PredictionType } from "@/lib/groupPredictionTypes";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DriverPicker } from "@/components/ui/F1Pickers";
import { useAuth } from "@/providers/AuthProvider";
import type { GroupRole } from "@/lib/supabase/groups";
// From the feed's own post/ tree, not a second copy - the same community-trend bars a prediction
// gets when it shows up in the feed, so "what did everyone else pick" reads identically wherever a
// round is shown.
import { PredictionTrendBars } from "../../components/post/PredictionTrendBars";

type DriverOption = { code: string; name: string };

/** Everything that can stop someone entering, worked out once and in one place so the card can say
 * exactly which it is instead of just disabling a button. */
type Blocker =
  | { kind: "locked"; message: string }
  | { kind: "resolved"; message: string }
  | { kind: "raceRun"; message: string }
  | { kind: "noDrivers"; message: string }
  | { kind: "noPoints"; message: string }
  | null;

function blockerFor(prediction: GroupPrediction, drivers: DriverOption[], pointsBalance: number, hasEntry: boolean): Blocker {
  if (prediction.status === "resolved") return { kind: "resolved", message: "Results are in." };
  if (prediction.status === "locked") return { kind: "locked", message: "Predictions are locked. Results appear after the race." };
  // A round left open past its own race is a real state (nobody locked it): treat it as closed for
  // entry rather than letting someone predict a result that already happened.
  if (prediction.raceStatus === "completed") return { kind: "raceRun", message: "This race has already run. Waiting for an admin to resolve it." };
  // The roster prefers this race's own session data but falls back to the most recently known
  // line-up otherwise (getRaceRoster, in lib/supabase/races.ts) - so this now only fires in the
  // genuine edge case where NO race, this season or last, has one yet (a brand new season's
  // opener, asked about before the pipeline has touched anything).
  if (drivers.length === 0 && prediction.type !== "dnf_count") {
    return { kind: "noDrivers", message: "No driver line-up is available yet for this season." };
  }
  // `hasEntry` covers the optimistic copy too (see PredictionCard's own comment) - otherwise a
  // stale, not-yet-refreshed pointsBalance prop could flash this at someone re-opening the form to
  // edit a pick they already successfully paid for a moment ago.
  if (!hasEntry && pointsBalance < prediction.entryPoints) {
    return { kind: "noPoints", message: `You need ${prediction.entryPoints} points to enter. You have ${pointsBalance}.` };
  }
  return null;
}

/**
 * One prediction round.
 *
 * The states it can be in are all real and all distinguishable: open and un-entered, open and
 * entered (with the guess shown back and editable), locked, resolved (with the actual answer and
 * what it paid), and the several ways a round can be un-enterable that aren't "locked" - see
 * blockerFor. The previous version showed a driver dropdown and a Participate button in every one
 * of those cases.
 *
 * The countdown ticks once a minute off the shared useMinuteClock rather than its own interval, and
 * only renders when there's a real `race_date` to count to.
 */
export function PredictionCard({
  groupId,
  prediction,
  myRole,
  drivers,
  pointsBalance,
  onChanged,
}: {
  groupId: string;
  prediction: GroupPrediction;
  myRole: GroupRole;
  drivers: DriverOption[];
  pointsBalance: number;
  onChanged: () => void;
}) {
  const now = useMinuteClock();
  const { refreshPointsBalance } = useAuth();
  const [guess, setGuess] = useState<unknown>(prediction.myEntry?.guess ?? (prediction.type === "podium" ? ["", "", ""] : ""));
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");

  // `prediction` is a prop from the page's own server component, refreshed only by `onChanged`
  // (router.refresh() - see GroupPredictions' own comment), which re-runs this whole page's data
  // fetch and can genuinely take a few seconds. Without this, a successful submit left the form
  // sitting there and the entry count unchanged for however long that took - looking like nothing
  // happened even though the points had already been spent - rather than showing what just
  // happened immediately. Cleared the moment the real prop catches up, so there's only ever one
  // source of truth once it does, never two copies that could disagree.
  const [optimisticEntry, setOptimisticEntry] = useState<GroupPrediction["myEntry"]>(null);
  useEffect(() => {
    if (prediction.myEntry) setOptimisticEntry(null);
  }, [prediction.myEntry]);
  const myEntry = prediction.myEntry ?? optimisticEntry;
  const entryCount = prediction.entryCount + (!prediction.myEntry && optimisticEntry ? 1 : 0);

  const isAdmin = myRole === "admin";
  const blocker = blockerFor(prediction, drivers, pointsBalance, myEntry !== null);
  const raceAt = prediction.raceDate ? parseUtcDateTime(prediction.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : "";

  async function submit() {
    setStatus("saving");
    setError("");
    const res = await fetch(`/api/groups/${groupId}/predictions/${prediction.id}/enter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't submit your prediction.");
      setStatus("idle");
      return;
    }
    setOptimisticEntry({ guess: guess as PredictionGuess, pointsWagered: prediction.entryPoints, pointsAwarded: null });
    // Entering spends points server-side immediately - the header's own balance (a separate client
    // store, not this page's props) is stale the instant that happens, not just after this page's
    // own refresh eventually lands.
    refreshPointsBalance();
    setStatus("idle");
    setEditing(false);
    onChanged();
  }

  async function resolve() {
    setStatus("saving");
    setError("");
    const res = await fetch(`/api/groups/${groupId}/predictions/${prediction.id}/resolve`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't resolve this round yet.");
      setStatus("idle");
      return;
    }
    // Resolving pays out - including, if the resolving admin also entered, to themself.
    refreshPointsBalance();
    setStatus("idle");
    onChanged();
  }

  const guessComplete = prediction.type === "podium" ? Array.isArray(guess) && (guess as string[]).every(Boolean) : guess !== "" && guess !== undefined && guess !== null;

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60">
      <header className="border-b border-[var(--f1-line)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold uppercase tracking-wide text-white">{prediction.raceName}</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              {predictionTypeLabels[prediction.type]} · {prediction.entryPoints} points to enter
            </p>
          </div>
          <StatusBadge prediction={prediction} />
        </div>

        {prediction.status === "open" && (
          <p className="mt-2 text-xs text-neutral-400">
            {countdown ? (
              <>
                Closes in <span className="font-semibold tabular-nums text-white">{countdown}</span>
              </>
            ) : prediction.raceDate ? (
              "Closing now"
            ) : (
              // Real state, said plainly: a calendar-only round the pipeline hasn't dated yet.
              "Race date to be confirmed"
            )}
          </p>
        )}
      </header>

      <div className="px-4 py-3.5">
        <p className="text-xs text-neutral-500">
          {entryCount} {entryCount === 1 ? "person has" : "people have"} entered
        </p>

        {/* The community's own split of picks - the same bars a round gets in the feed, so a
            round reads like a real betting slip (what's the field think, not just what I picked)
            wherever it's shown, not just there. Self-fetches and degrades to nothing on its own if
            it can't load - see its own comment. */}
        <PredictionTrendBars groupId={groupId} predictionId={prediction.id} isPodium={prediction.type === "podium"} />

        {/* Resolved: the real answer and what it actually paid this user. */}
        {prediction.status === "resolved" && (
          <div className="mt-3 space-y-2">
            <Row label="Result" value={formatGuess(prediction.type, prediction.correctAnswer, drivers)} />
            {prediction.myEntry ? (
              <>
                <Row label="Your prediction" value={formatGuess(prediction.type, prediction.myEntry.guess, drivers)} />
                <Row
                  label="Points"
                  value={
                    prediction.myEntry.pointsAwarded === null
                      ? "Not scored"
                      : prediction.myEntry.pointsAwarded > 0
                        ? `+${prediction.myEntry.pointsAwarded}`
                        : `-${prediction.myEntry.pointsWagered}`
                  }
                  highlight={(prediction.myEntry.pointsAwarded ?? 0) > 0}
                />
              </>
            ) : (
              <p className="text-xs text-neutral-600">You didn&apos;t enter this round.</p>
            )}
          </div>
        )}

        {/* Entered and still open: show it back, with what it's actually worth if it lands (the
            real double-or-nothing payout resolvePrediction pays out - see its own comment) and a
            way to change it while there's time. */}
        {prediction.status !== "resolved" && myEntry && !editing && (
          <div className="mt-3 space-y-2">
            <Row label="Your prediction" value={formatGuess(prediction.type, myEntry.guess, drivers)} />
            <Row label="Potential payout" value={payoutPreview(prediction.type, myEntry.pointsWagered)} highlight />
            {!blocker && (
              <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs font-medium text-neutral-300 underline-offset-2 transition hover:text-white hover:underline">
                Change prediction
              </button>
            )}
          </div>
        )}

        {/* The entry form, only when entering is genuinely possible. */}
        {prediction.status !== "resolved" && !blocker && (!myEntry || editing) && (
          <div className="mt-3">
            <GuessInput type={prediction.type} drivers={drivers} value={guess} onChange={setGuess} />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={status === "saving" || !guessComplete}
                className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {status === "saving" ? "Submitting…" : myEntry ? "Update prediction" : "Submit prediction"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setGuess(myEntry?.guess ?? "");
                  }}
                  className="text-xs text-neutral-500 transition hover:text-white"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Why you can't enter, specifically. */}
        {blocker && prediction.status !== "resolved" && <p className="mt-3 text-xs leading-relaxed text-neutral-500">{blocker.message}</p>}

        {error && (
          <p role="alert" className="mt-2 text-xs text-[var(--f1-red)]">
            {error}
          </p>
        )}

        {/* Resolving pays points out, so it stays admin-only regardless of the community's
            create-predictions permission. */}
        {isAdmin && prediction.status !== "resolved" && (
          <div className="mt-3 border-t border-[var(--f1-line)] pt-3">
            <ConfirmButton
              onConfirm={() => void resolve()}
              question="Resolve and pay out?"
              confirmLabel="Resolve"
              pending={status === "saving"}
              className="text-xs font-medium text-neutral-400 transition hover:text-white disabled:opacity-40"
            >
              Resolve this round
            </ConfirmButton>
          </div>
        )}
      </div>
    </article>
  );
}

function StatusBadge({ prediction }: { prediction: GroupPrediction }) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-emerald-400/10 text-emerald-400" },
    locked: { label: "Locked", className: "bg-white/[0.06] text-neutral-400" },
    resolved: { label: "Resolved", className: "bg-[var(--f1-red)]/10 text-[var(--f1-red)]" },
  };
  const badge = map[prediction.status] ?? map.open;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>{badge.label}</span>;
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className={`text-right font-medium ${highlight ? "text-emerald-400" : "text-neutral-200"}`}>{value}</span>
    </div>
  );
}

/** What entering actually pays, said in the same terms resolvePrediction (groupPredictions.ts) pays
 * out at - `round(wagered * payoutFraction * 2)`, so nothing shown here can drift from the real
 * scoring math. A single-guess type either lands exactly or doesn't (`payoutFraction` is 1 or 0),
 * so its payout is a real number; podium scores per slot (right driver, right podium spot = full
 * credit; right driver, wrong spot = partial), so its payout is a range rather than one figure. */
function payoutPreview(type: PredictionType, wagered: number): string {
  if (type === "podium") return `Up to +${wagered * 2} pts, by slots right`;
  return `+${wagered * 2} pts if correct`;
}

/** Driver codes become real names where the roster is known - "HAM" alone is fine for an F1 regular
 * and meaningless to everyone else. */
function formatGuess(type: PredictionType, guess: unknown, drivers: DriverOption[]): string {
  if (guess === null || guess === undefined || guess === "") return "—";
  const name = (code: string) => drivers.find((d) => d.code === code)?.name ?? code;
  if (type === "podium" && Array.isArray(guess)) return (guess as string[]).map(name).join(" · ");
  if (type === "dnf_count") return String(guess);
  return name(String(guess));
}

function GuessInput({ type, drivers, value, onChange }: { type: PredictionType; drivers: DriverOption[]; value: unknown; onChange: (v: unknown) => void }) {
  if (type === "podium") {
    const guess = (Array.isArray(value) ? value : ["", "", ""]) as string[];
    return (
      <div className="grid grid-cols-3 gap-2">
        {(["P1", "P2", "P3"] as const).map((label, i) => (
          <div key={label} className="text-[10px] text-neutral-500">
            {label}
            <DriverPicker
              drivers={drivers}
              value={guess[i] ?? ""}
              onChange={(code) => {
                const next = [...guess];
                next[i] = code;
                onChange(next);
              }}
              placeholder="Select"
              ariaLabel={`Podium ${label}`}
              className="mt-0.5"
            />
          </div>
        ))}
      </div>
    );
  }

  if (type === "dnf_count") {
    return (
      <input
        type="number"
        min={0}
        max={20}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder="How many cars won't finish?"
        aria-label="Number of DNFs"
        className="w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
      />
    );
  }

  return <DriverPicker drivers={drivers} value={typeof value === "string" ? value : ""} onChange={onChange} />;
}
