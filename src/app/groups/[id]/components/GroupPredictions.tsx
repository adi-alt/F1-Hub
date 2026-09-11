"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// From the pure groupPredictionTypes.ts, not @/lib/supabase/groupPredictions - that module reaches
// otp.ts's nodemailer import through groups.ts, which crashes a client bundle that imports it for
// anything beyond an erased `import type` (predictionTypeLabels is a real runtime value) - see
// groupPredictionTypes.ts's own comment.
import { predictionTypeLabels, type GroupPrediction, type PredictionType } from "@/lib/groupPredictionTypes";
import { PredictionCard } from "./PredictionCard";
import { RacePicker } from "@/components/ui/F1Pickers";
import { Picker } from "@/components/ui/Picker";
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
        <div className="text-xs text-neutral-500">
          Race
          <RacePicker races={races} value={raceId} onChange={setRaceId} ariaLabel="Race for this prediction" className="mt-1" />
        </div>
        <div className="text-xs text-neutral-500">
          Prediction type
          <Picker
            options={TYPES.map((t) => ({ value: t, label: predictionTypeLabels[t] }))}
            value={type}
            onChange={(next) => setType(next as PredictionType)}
            ariaLabel="Prediction type"
            className="mt-1"
          />
        </div>
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
          {predictions.map((p) => (
            <PredictionCard key={p.id} groupId={groupId} prediction={p} myRole={myRole} drivers={driversByRace[p.raceId] ?? []} pointsBalance={pointsBalance} onChanged={() => router.refresh()} />
          ))}
        {predictions.length === 0 && (
          <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-10 text-center">
            <p className="text-sm font-semibold text-neutral-300">No predictions are active yet.</p>
            <p className="mt-1 text-xs text-neutral-500">
              {myRole === "admin" ? "Open a round and the community can start predicting." : "An admin opens rounds ahead of a race weekend."}
            </p>
            {myRole === "admin" && !showNew && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-4 rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
              >
                Create a prediction round
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
