"use client";

import { useState } from "react";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { predictionTypeLabels, type GroupPrediction, type PredictionType } from "@/lib/groupPredictionTypes";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DriverPicker } from "@/components/ui/F1Pickers";
import type { GroupRole } from "@/lib/supabase/groups";

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

function blockerFor(prediction: GroupPrediction, drivers: DriverOption[], pointsBalance: number): Blocker {
  if (prediction.status === "resolved") return { kind: "resolved", message: "Results are in." };
  if (prediction.status === "locked") return { kind: "locked", message: "Predictions are locked. Results appear after the race." };
  // A round left open past its own race is a real state (nobody locked it): treat it as closed for
  // entry rather than letting someone predict a result that already happened.
  if (prediction.raceStatus === "completed") return { kind: "raceRun", message: "This race has already run. Waiting for an admin to resolve it." };
  // The roster comes from the race's own session data; before the pipeline has it there's nothing
  // honest to offer in a driver picker.
  if (drivers.length === 0 && prediction.type !== "dnf_count") {
    return { kind: "noDrivers", message: "The driver list for this race isn't available yet. Check back closer to the weekend." };
  }
  if (!prediction.myEntry && pointsBalance < prediction.entryPoints) {
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
  const [guess, setGuess] = useState<unknown>(prediction.myEntry?.guess ?? (prediction.type === "podium" ? ["", "", ""] : ""));
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");

  const isAdmin = myRole === "admin";
  const blocker = blockerFor(prediction, drivers, pointsBalance);
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
          {prediction.entryCount} {prediction.entryCount === 1 ? "person has" : "people have"} entered
        </p>

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

        {/* Entered and still open: show it back, with a way to change it while there's time. */}
        {prediction.status !== "resolved" && prediction.myEntry && !editing && (
          <div className="mt-3">
            <Row label="Your prediction" value={formatGuess(prediction.type, prediction.myEntry.guess, drivers)} />
            {!blocker && (
              <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs font-medium text-neutral-300 underline-offset-2 transition hover:text-white hover:underline">
                Change prediction
              </button>
            )}
          </div>
        )}

        {/* The entry form, only when entering is genuinely possible. */}
        {prediction.status !== "resolved" && !blocker && (!prediction.myEntry || editing) && (
          <div className="mt-3">
            <GuessInput type={prediction.type} drivers={drivers} value={guess} onChange={setGuess} />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={status === "saving" || !guessComplete}
                className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {status === "saving" ? "Submitting…" : prediction.myEntry ? "Update prediction" : "Submit prediction"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setGuess(prediction.myEntry?.guess ?? "");
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
