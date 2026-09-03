"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
// From the pure groupPredictionTypes.ts, not @/lib/supabase/groupPredictions - that module reaches
// otp.ts's nodemailer import through groups.ts, which crashes a client bundle that imports it for
// anything beyond an erased `import type` (predictionTypeLabels is a real runtime value) - see
// groupPredictionTypes.ts's own comment.
import { predictionTypeLabels, type GroupPrediction, type PredictionType } from "@/lib/groupPredictionTypes";
import type { GroupRole } from "@/lib/supabase/groups";

const ENTRY_PRESETS = [10, 20, 50, 100];
const TYPES: PredictionType[] = ["winner", "podium", "fastest_lap", "pole", "dnf_count"];

type RaceOption = { id: string; name: string; round: number; status: string };
type DriverOption = { code: string; name: string };

function NewPredictionForm({ groupId, races, onCreated }: { groupId: string; races: RaceOption[]; onCreated: () => void }) {
  const [raceId, setRaceId] = useState(races[0]?.id ?? "");
  const [type, setType] = useState<PredictionType>("winner");
  const [entryPoints, setEntryPoints] = useState(20);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    if (!raceId) return;
    setStatus("saving");
    const entry = custom ? Number(custom) : entryPoints;
    const res = await fetch(`/api/groups/${groupId}/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId, type, entryPoints: entry }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Could not create prediction.");
      setStatus("error");
      return;
    }
    setStatus("idle");
    onCreated();
  }

  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-neutral-500">
          Race
          <select value={raceId} onChange={(e) => setRaceId(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white">
            {races.map((r) => (
              <option key={r.id} value={r.id}>
                R{r.round} {r.name} {r.status === "completed" ? "(completed)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-500">
          Prediction type
          <select value={type} onChange={(e) => setType(e.target.value as PredictionType)} className="mt-1 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white">
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {predictionTypeLabels[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3">
        <p className="text-xs text-neutral-500">Prediction entry</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {ENTRY_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setEntryPoints(p);
                setCustom("");
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                !custom && entryPoints === p ? "border-[var(--f1-red)] bg-[var(--f1-red)]/10 text-white" : "border-[var(--f1-line)] text-neutral-400 hover:border-white/30"
              }`}
            >
              {p} points
            </button>
          ))}
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
            placeholder="Custom"
            className="w-20 rounded-full border border-[var(--f1-line)] bg-black/30 px-3 py-1 text-xs text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-[var(--f1-red)]">{error}</p>}
      <button
        onClick={() => void submit()}
        disabled={status === "saving" || !raceId}
        className="mt-3 rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {status === "saving" ? "Creating…" : "Create prediction"}
      </button>
    </div>
  );
}

function GuessInput({ type, drivers, value, onChange }: { type: PredictionType; drivers: DriverOption[]; value: unknown; onChange: (v: unknown) => void }) {
  if (type === "podium") {
    const guess = (Array.isArray(value) ? value : ["", "", ""]) as string[];
    return (
      <div className="grid grid-cols-3 gap-2">
        {(["P1", "P2", "P3"] as const).map((label, i) => (
          <label key={label} className="text-[10px] text-neutral-500">
            {label}
            <select
              value={guess[i] ?? ""}
              onChange={(e) => {
                const next = [...guess];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="mt-0.5 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-2 py-1.5 text-xs text-white"
            >
              <option value="">Select</option>
              {drivers.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }
  if (type === "dnf_count") {
    return (
      <input
        type="number"
        min={0}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder="Number of DNFs"
        className="w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-neutral-600"
      />
    );
  }
  return (
    <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-1.5 text-xs text-white">
      <option value="">Select driver</option>
      {drivers.map((d) => (
        <option key={d.code} value={d.code}>
          {d.name} ({d.code})
        </option>
      ))}
    </select>
  );
}

function guessLabel(type: PredictionType, guess: unknown): string {
  if (guess === null || guess === undefined) return "–";
  if (type === "podium" && Array.isArray(guess)) return guess.join(" · ");
  return String(guess);
}

function PredictionCard({ groupId, prediction, myRole, drivers, pointsBalance, onChanged }: { groupId: string; prediction: GroupPrediction; myRole: GroupRole; drivers: DriverOption[]; pointsBalance: number; onChanged: () => void }) {
  const [guess, setGuess] = useState<unknown>(prediction.type === "podium" ? ["", "", ""] : "");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const canAfford = pointsBalance >= prediction.entryPoints;

  async function enter() {
    setStatus("saving");
    const res = await fetch(`/api/groups/${groupId}/predictions/${prediction.id}/enter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Could not enter.");
      setStatus("error");
      return;
    }
    onChanged();
  }

  async function resolve() {
    setStatus("saving");
    const res = await fetch(`/api/groups/${groupId}/predictions/${prediction.id}/resolve`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Could not resolve yet.");
      setStatus("error");
      return;
    }
    onChanged();
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{prediction.raceName}</p>
          <p className="text-xs text-neutral-500">
            {predictionTypeLabels[prediction.type]} · {prediction.entryPoints} pt entry · {prediction.entryCount} entered
          </p>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${prediction.status === "resolved" ? "text-neutral-500" : prediction.status === "locked" ? "text-amber-400" : "text-emerald-400"}`}>
          {prediction.status}
        </span>
      </div>

      {prediction.status === "resolved" ? (
        <div className="mt-3 rounded-lg border border-[var(--f1-line)] bg-black/20 p-3 text-xs">
          <p className="text-neutral-500">Correct answer</p>
          <p className="font-mono text-sm text-white">{guessLabel(prediction.type, prediction.correctAnswer)}</p>
          {prediction.myEntry && (
            <>
              <p className="mt-2 text-neutral-500">You predicted</p>
              <p className="font-mono text-sm text-neutral-300">{guessLabel(prediction.type, prediction.myEntry.guess)}</p>
              <p className={`mt-1.5 font-semibold ${prediction.myEntry.pointsAwarded ? "text-emerald-400" : "text-[var(--f1-red)]"}`}>
                {prediction.myEntry.pointsAwarded ? `✓ Correct · +${prediction.myEntry.pointsAwarded} points` : "✕ Incorrect"}
              </p>
            </>
          )}
        </div>
      ) : prediction.myEntry ? (
        <p className="mt-3 text-xs text-neutral-500">
          You predicted <span className="font-mono text-neutral-300">{guessLabel(prediction.type, prediction.myEntry.guess)}</span> · {prediction.myEntry.pointsWagered} points wagered
        </p>
      ) : prediction.status === "open" ? (
        <div className="mt-3">
          <GuessInput type={prediction.type} drivers={drivers} value={guess} onChange={setGuess} />
          {!canAfford && (
            <p className="mt-2 text-xs text-[var(--f1-red)]">
              You need at least {prediction.entryPoints} points to enter this prediction. Current balance: {pointsBalance} points.
            </p>
          )}
          <button
            onClick={() => void enter()}
            disabled={status === "saving" || !canAfford}
            className="mt-2 rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            Participate
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">Locked - no longer accepting entries.</p>
      )}

      {myRole === "admin" && prediction.status !== "resolved" && (
        <button onClick={() => void resolve()} disabled={status === "saving"} className="mt-3 block text-xs text-neutral-500 hover:text-white">
          Resolve now →
        </button>
      )}
      {error && <p className="mt-2 text-xs text-[var(--f1-red)]">{error}</p>}
    </motion.div>
  );
}

/** No local copy of predictions/balance - both come straight from props, refreshed via
 * router.refresh() after any mutation (same pattern this app's own AvatarUpload/JoinPrompt already
 * use for "the server component that fetched this needs to re-run"), rather than a second
 * client-fetchable endpoint duplicating what page.tsx already fetches server-side once. */
export function GroupPredictions({
  groupId,
  myRole,
  predictions,
  races,
  driversByRace,
  pointsBalance,
}: {
  groupId: string;
  myRole: GroupRole;
  predictions: GroupPrediction[];
  races: RaceOption[];
  driversByRace: Record<string, DriverOption[]>;
  pointsBalance: number;
}) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);

  return (
    <div>
      {myRole === "admin" && (
        <div className="mb-4">
          {showNew ? (
            <NewPredictionForm
              groupId={groupId}
              races={races}
              onCreated={() => {
                setShowNew(false);
                router.refresh();
              }}
            />
          ) : (
            <button onClick={() => setShowNew(true)} className="rounded-full border border-[var(--f1-line)] px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:border-white/30">
              + New Prediction
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {predictions.map((p) => (
            <PredictionCard key={p.id} groupId={groupId} prediction={p} myRole={myRole} drivers={driversByRace[p.raceId] ?? []} pointsBalance={pointsBalance} onChanged={() => router.refresh()} />
          ))}
        </AnimatePresence>
        {predictions.length === 0 && (
          <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-6 text-center text-sm text-neutral-500">
            No predictions yet{myRole === "admin" ? " - create one above." : " - check back once an admin opens one."}
          </p>
        )}
      </div>
    </div>
  );
}
