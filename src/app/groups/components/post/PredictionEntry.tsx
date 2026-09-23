"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { DriverPicker } from "@/components/ui/F1Pickers";
import { useAuth } from "@/providers/AuthProvider";
import { groupHref } from "@/lib/routes";
import type { PredictionGuess, PredictionType } from "@/lib/groupPredictionTypes";

export type DriverOption = { code: string; name: string };

/** Everything that can stop someone entering, worked out once so the card can say which it is
 * instead of just disabling a button. Mirrors the community page's own blockerFor - the server
 * enforces every one of these regardless (enterPrediction re-checks status, race state, membership
 * and the wallet), so this is about telling the truth in the UI, not about access control. */
function blockerFor(args: { closed: boolean; drivers: DriverOption[]; type: PredictionType; entryPoints: number; pointsBalance: number | null; alreadyEntered: boolean }): string | null {
  if (args.closed) return "This race has already started. Waiting for the result.";
  // See PredictionCard's own blockerFor (and getRaceRoster in lib/supabase/races.ts) - the roster
  // falls back to the most recently known line-up, so this is now the genuine edge case, not the
  // common state of "opened a round for next weekend before the pipeline caught up".
  if (args.type !== "dnf_count" && args.drivers.length === 0) return "No driver line-up is available yet for this season.";
  if (!args.alreadyEntered && args.pointsBalance !== null && args.pointsBalance < args.entryPoints) {
    return `You need ${args.entryPoints} points to enter. You have ${args.pointsBalance}.`;
  }
  return null;
}

/**
 * Entering a prediction from the feed, in place.
 *
 * "Enter prediction" used to be a link to the community's Predictions tab - the button navigated
 * away rather than doing the thing it named, and the feed lost its position. This submits to the
 * SAME endpoint that tab uses (`POST /api/groups/{id}/predictions/{predictionId}/enter`, which runs
 * enterPrediction with its real membership, wallet and round-state checks), so there is one entry
 * path, not two.
 *
 * On success the card updates in place - no reload, no navigation - because the parent holds the
 * entered state and this reports the new pick back up through `onEntered`.
 */
export function PredictionEntry({
  groupId,
  predictionId,
  type,
  entryPoints,
  drivers,
  closed,
  onEntered,
}: {
  groupId: string;
  predictionId: string;
  type: PredictionType;
  entryPoints: number;
  drivers: DriverOption[];
  closed: boolean;
  /** Hands the accepted guess back so the card can show "Your pick" without refetching. */
  onEntered: (guess: PredictionGuess, label: string) => void;
}) {
  const { pointsBalance, refreshPointsBalance } = useAuth();
  const [open, setOpen] = useState(false);
  const [single, setSingle] = useState("");
  const [podium, setPodium] = useState<[string, string, string]>(["", "", ""]);
  const [dnf, setDnf] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const blocker = blockerFor({ closed, drivers, type, entryPoints, pointsBalance, alreadyEntered: false });

  const guess: PredictionGuess | null =
    type === "podium"
      ? podium.every(Boolean) && new Set(podium).size === 3
        ? podium
        : null
      : type === "dnf_count"
        ? dnf.trim() !== "" && Number.isInteger(Number(dnf)) && Number(dnf) >= 0
          ? Number(dnf)
          : null
        : single
          ? single
          : null;

  function labelFor(value: PredictionGuess): string {
    const nameOf = (code: string) => drivers.find((d) => d.code === code)?.name ?? code;
    if (typeof value === "number") return `${value} ${value === 1 ? "retirement" : "retirements"}`;
    if (Array.isArray(value)) return value.map(nameOf).join(", ");
    return nameOf(value);
  }

  async function submit() {
    if (guess === null || saving) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/predictions/${predictionId}/enter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Could not enter this prediction.");
      setSaving(false);
      return;
    }
    // Entering spends points, so the header's balance is now stale - this is the same refresh the
    // community page relies on rather than a second, parallel wallet read.
    refreshPointsBalance();
    setSaving(false);
    setOpen(false);
    onEntered(guess, labelFor(guess));
  }

  if (blocker) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-neutral-500">{blocker}</span>
        <Link href={`${groupHref(groupId)}?tab=predictions`} className="text-[11.5px] font-medium text-neutral-400 underline-offset-2 hover:text-white hover:underline">
          View in community
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-7 items-center gap-1.5 rounded-lg bg-[var(--f1-red)] px-3 text-[12px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
        >
          Enter prediction
        </button>
        <span className="text-[11px] text-neutral-500">{entryPoints} pts</span>
      </div>
    );
  }

  return (
    // height:auto through AnimatePresence, with overflow-hidden only for the duration of the
    // transition - the panel grows the card, and easing that is the difference between the feed
    // sliding and the feed jumping under the cursor.
    <AnimatePresence initial={false}>
      <motion.div
        key="entry"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
        <div className="mt-2.5 rounded-lg border border-white/[0.08] bg-black/25 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {type === "podium" ? "Pick your podium" : type === "dnf_count" ? "How many retirements?" : "Your pick"}
      </p>

      <div className="mt-1.5">
        {type === "podium" ? (
          <div className="grid gap-1.5 sm:grid-cols-3">
            {([0, 1, 2] as const).map((slot) => (
              <DriverPicker
                key={slot}
                drivers={drivers}
                value={podium[slot]}
                onChange={(code) =>
                  setPodium((prev) => {
                    const next: [string, string, string] = [...prev];
                    next[slot] = code;
                    return next;
                  })
                }
                ariaLabel={`Podium position ${slot + 1}`}
              />
            ))}
          </div>
        ) : type === "dnf_count" ? (
          <input
            type="number"
            min={0}
            max={20}
            value={dnf}
            onChange={(e) => setDnf(e.target.value)}
            aria-label="Number of retirements"
            className="h-8 w-24 rounded-md border border-white/[0.08] bg-black/30 px-2 text-[13px] tabular-nums text-white focus:border-white/25 focus:outline-none"
          />
        ) : (
          <DriverPicker drivers={drivers} value={single} onChange={setSingle} ariaLabel="Your pick" />
        )}
      </div>

      {type === "podium" && podium.some(Boolean) && new Set(podium.filter(Boolean)).size !== podium.filter(Boolean).length && (
        <p className="mt-1.5 text-[11px] text-amber-400">Pick three different drivers.</p>
      )}
      {error && <p className="mt-1.5 text-[11px] text-[var(--f1-red)]">{error}</p>}

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px] text-neutral-500">Costs {entryPoints} pts</span>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-[11.5px] font-medium text-neutral-400 transition hover:text-white">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={guess === null || saving}
          className="flex h-7 items-center rounded-lg bg-[var(--f1-red)] px-3 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "Entering…" : "Confirm entry"}
        </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
