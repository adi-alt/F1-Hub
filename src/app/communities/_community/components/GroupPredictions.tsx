"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
// From the pure groupPredictionTypes.ts, not @/lib/supabase/groupPredictions - that module reaches
// otp.ts's nodemailer import through groups.ts, which crashes a client bundle that imports it for
// anything beyond an erased `import type` (predictionTypeLabels is a real runtime value) - see
// groupPredictionTypes.ts's own comment.
import { predictionTypeLabels, type GroupPrediction, type PredictionType } from "@/lib/groupPredictionTypes";
import { PredictionCard } from "./PredictionCard";
import { RacePicker } from "@/components/ui/F1Pickers";
import { Picker } from "@/components/ui/Picker";
import { EmptyState } from "@/components/ui/EmptyState";
import { fieldControlClass } from "@/components/ui/Field";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import type { GroupRole } from "@/lib/supabase/groups";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

const ENTRY_PRESETS = [10, 20, 50, 100];
const TYPES: PredictionType[] = ["winner", "podium", "fastest_lap", "pole", "dnf_count"];

type RaceOption = { id: string; name: string; round: number; status: string };
type DriverOption = { code: string; name: string; headshotUrl: string | null };

function NewPredictionForm({ groupId, races, onCreated, onCancel }: { groupId: string; races: RaceOption[]; onCreated: () => void; onCancel: () => void }) {
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
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? "Couldn't open the round. Check your connection and try again.");
      setStatus("error");
      return;
    }
    setStatus("idle");
    onCreated();
  }

  return (
    <div className={`p-5 ${PANEL}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={EYEBROW}>Race</span>
          <RacePicker races={races} value={raceId} onChange={setRaceId} ariaLabel="Race for this round" className="mt-2" />
        </div>
        <div>
          <span className={EYEBROW}>What to predict</span>
          <Picker
            options={TYPES.map((t) => ({ value: t, label: predictionTypeLabels[t] }))}
            value={type}
            onChange={(next) => setType(next as PredictionType)}
            ariaLabel="What to predict"
            className="mt-2"
          />
        </div>
      </div>

      <div className="mt-4">
        <p className={EYEBROW}>Entry</p>
        <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Entry points">
          {ENTRY_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={!custom && entryPoints === p}
              onClick={() => {
                setEntryPoints(p);
                setCustom("");
              }}
              className={`h-10 rounded-control border px-3 text-body-sm font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                !custom && entryPoints === p ? "border-strong bg-surface-3 text-primary" : "border-subtle text-secondary hover:text-primary"
              }`}
            >
              {p} pts
            </button>
          ))}
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
            placeholder="Custom"
            aria-label="Custom entry points"
            inputMode="numeric"
            className={`w-24 ${fieldControlClass(false)}`}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-caption text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Button variant="primary" size="md" onClick={() => void submit()} disabled={!raceId} loading={status === "saving"}>
          Open round
        </Button>
        <Button variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
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
              onCancel={() => setShowNew(false)}
              onCreated={() => {
                setShowNew(false);
                router.refresh();
              }}
            />
          ) : (
            <Button variant="secondary" size="md" iconStart={Plus} onClick={() => setShowNew(true)}>
              New prediction round
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
          {predictions.map((p) => (
            <PredictionCard key={p.id} groupId={groupId} prediction={p} myRole={myRole} drivers={driversByRace[p.raceId] ?? []} pointsBalance={pointsBalance} onChanged={() => router.refresh()} />
          ))}
        {predictions.length === 0 && (
          <EmptyState
            icon={Trophy}
            message={
              myRole === "admin"
                ? "No prediction rounds are open. Open one above and the community can start predicting."
                : "No prediction rounds are active: an admin opens them ahead of a race weekend."
            }

          />
        )}
      </div>
    </div>
  );
}
