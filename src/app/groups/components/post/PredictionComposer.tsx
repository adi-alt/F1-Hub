"use client";

import { useState } from "react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Picker } from "@/components/ui/Picker";
import { RacePicker } from "@/components/ui/F1Pickers";
import { predictionTypeLabels, type PredictionType } from "@/lib/groupPredictionTypes";
import type { GroupSummary } from "@/lib/supabase/groups";

export type RaceOption = { id: string; name: string; round: number; status: string };

const TYPES: PredictionType[] = ["winner", "podium", "fastest_lap", "pole", "dnf_count"];
const ENTRY_PRESETS = [10, 20, 50, 100];

/**
 * Opening a prediction round from the home composer, for the communities where the viewer actually
 * holds the permission to do it.
 *
 * `communities` is already filtered by the caller to those that pass the SAME canDo(...,
 * "createPredictions", myRole) check the server runs - but that filtering is a convenience, not the
 * control: createPrediction re-derives the viewer's role and the community's own permission map
 * server-side and rejects anything it doesn't like, so a hand-crafted request gets the same 403 a
 * hidden button would have prevented. The races offered are this season's own un-finished rounds,
 * which is exactly the set createPrediction will accept.
 *
 * This posts to the existing /api/groups/{id}/predictions endpoint - the same one the community's
 * own Predictions tab uses. There is no second creation path.
 */
export function PredictionComposer({
  communities,
  races,
  onCreated,
}: {
  communities: GroupSummary[];
  races: RaceOption[];
  onCreated: (groupId: string) => void;
}) {
  const [groupId, setGroupId] = useState(communities[0]?.id ?? "");
  const [raceId, setRaceId] = useState(races[0]?.id ?? "");
  const [type, setType] = useState<PredictionType>("winner");
  const [entryPoints, setEntryPoints] = useState(20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const community = communities.find((c) => c.id === groupId) ?? null;
  const canSubmit = !!groupId && !!raceId && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId, type, entryPoints }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Could not create this prediction.");
      setSaving(false);
      return;
    }
    setSaving(false);
    onCreated(groupId);
  }

  if (races.length === 0) {
    return <p className="mt-2 text-[11.5px] text-neutral-500">There are no upcoming rounds left this season to open a prediction on.</p>;
  }

  return (
    <div className="mt-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          Community
          <div className="mt-1">
            <Picker
              options={communities.map((c) => ({ value: c.id, label: c.name }))}
              value={groupId}
              onChange={setGroupId}
              ariaLabel="Community for this prediction"
            />
          </div>
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          Race
          <div className="mt-1">
            <RacePicker races={races} value={raceId} onChange={setRaceId} ariaLabel="Race for this prediction" />
          </div>
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          Prediction type
          <div className="mt-1">
            <Picker
              options={TYPES.map((t) => ({ value: t, label: predictionTypeLabels[t] }))}
              value={type}
              onChange={(next) => setType(next as PredictionType)}
              ariaLabel="Prediction type"
            />
          </div>
        </label>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          Entry cost
          <div className="mt-1 flex flex-wrap items-center gap-1" role="group" aria-label="Entry cost in points">
            {ENTRY_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEntryPoints(n)}
                aria-pressed={entryPoints === n}
                className={`rounded-md px-2 py-1 text-[11.5px] font-semibold tabular-nums transition ${
                  entryPoints === n ? "bg-[var(--f1-red)]/[0.16] text-[var(--f1-red)]" : "bg-white/[0.04] text-neutral-400 hover:text-white"
                }`}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min={0}
              step={1}
              value={entryPoints}
              onChange={(e) => setEntryPoints(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              aria-label="Custom entry cost"
              className="h-7 w-16 rounded-md border border-white/[0.07] bg-black/25 px-2 text-[11.5px] font-semibold tabular-nums text-white focus:border-white/20 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-[11px] text-[var(--f1-red)]">{error}</p>}

      <div className="mt-2.5 flex items-center gap-2">
        {community && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500">
            <EntityAvatar imageUrl={community.avatarUrl} name={community.name} seed={community.id} size={16} shape="square" />
            <span className="truncate">Opens in {community.name}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="ml-auto rounded-lg bg-[var(--f1-red)] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
        >
          {saving ? "Opening…" : "Open prediction"}
        </button>
      </div>
    </div>
  );
}
