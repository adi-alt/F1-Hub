"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useAuth } from "@/providers/AuthProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import type { RaceDoc, UserPick } from "@/lib/types/race";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

const DEFAULT_ERROR = "Pick 3 different drivers.";

function toFormState(data: UserPick) {
  return { p1: data.predictedPodium[0], p2: data.predictedPodium[1], p3: data.predictedPodium[2] };
}

// Shaped like the real card (label + P1/P2/P3 selects) - `useAuth`'s auth check is genuine async
// work on first paint, unlike a synchronous tab switch elsewhere on this page.
function PickPanelSkeleton() {
  return (
    <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <Skeleton className="h-3 w-32" />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {["P1", "P2", "P3"].map((label) => (
          <div key={label}>
            <Skeleton className="h-3 w-6" />
            <Skeleton className="mt-1 h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PickPanel({
  race,
  fallbackEntrants = [],
  raceSessionDate,
}: {
  race: RaceDoc;
  fallbackEntrants?: { driver: string; driverName: string; team: string }[];
  // The "Race" session's own real datetime (from `calendar`, see RaceWeekendPanel) - `race.status`
  // alone can't tell "race in progress" apart from "still upcoming" (the pipeline that would flip
  // it to "completed" runs on a batch schedule, not live - see races.ts's getRace docstring), so
  // this is the one honest, real signal this app has for "picks should be closing." Note this is a
  // client-side-only close, for the UI's sake - the actual save is still gated purely on
  // race.status server-side (saveUserPick, picks.ts), which is a real, pre-existing gap this alone
  // doesn't close (someone hitting the API directly could still save mid-race until the pipeline
  // catches up) - out of scope here, a genuine follow-up if picks-as-scoring integrity matters.
  raceSessionDate?: string | null;
}) {
  const { user, isAuthorized, loading } = useAuth();
  const now = useMinuteClock();
  const [pick, setPick] = useState({ p1: "", p2: "", p3: "" });
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState(DEFAULT_ERROR);

  useEffect(() => {
    // isAuthorized, not raw user — a session mid-OTP-flow isn't a real one yet.
    if (!isAuthorized) return;
    // Goes through the session-aware /api/picks endpoint (iron-session + Admin SDK), not a direct
    // client Firestore read — see api/picks/route.ts for why this is a separate small endpoint
    // rather than reading cookies() in the (ISR-cached) race page itself.
    fetch(`/api/picks?raceId=${encodeURIComponent(race.id)}`)
      .then((res) => res.json())
      .then((data: { pick: UserPick | null }) => {
        if (data.pick) setPick(toFormState(data.pick));
        setStatus("idle");
      })
      .catch(() => setStatus("error"));
  }, [isAuthorized, race.id]);

  if (loading) return <PickPanelSkeleton />;

  if (!isAuthorized) {
    return (
      <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4 text-sm text-neutral-400">
        Sign in to make your own podium pick for this race.
      </div>
    );
  }

  // `race.status === "scheduled"` means there's no real `races` row for this round yet (see
  // toCalendarPlaceholder in races.ts) - `race.id` in that case doesn't exist in the `races` table
  // at all, so saveUserPick's own server-side check (getRaceStatus, races.ts) would 403 on every
  // save attempt regardless of what's shown here. An editable form that can never actually save is
  // worse than this informational message - the same "don't create fake interactions" reasoning
  // PracticeSummary's own hover rows already follow.
  if (race.status === "scheduled") {
    return (
      <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4 text-sm text-neutral-400">
        Podium picks open once this race weekend begins.
      </div>
    );
  }

  // race.inputs (this race's own qualifying-derived grid) once it exists, else the current
  // grid (fallbackEntrants, from getCurrentEntrants) - so a pick can be made for the whole
  // pre-qualifying window instead of only once this race's own quali has happened.
  const entrants = race.inputs?.length ? race.inputs : fallbackEntrants;
  if (entrants.length === 0) {
    return (
      <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4 text-sm text-neutral-400">
        Podium picks open once this race weekend begins.
      </div>
    );
  }

  const isLocked = race.status !== "upcoming" || (!!raceSessionDate && new Date(raceSessionDate).getTime() <= now);

  async function submit() {
    if (!user) return;
    if (!pick.p1 || !pick.p2 || !pick.p3 || new Set([pick.p1, pick.p2, pick.p3]).size !== 3) {
      setErrorMessage(DEFAULT_ERROR);
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const res = await fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId: race.id, predictedWinner: pick.p1, predictedPodium: [pick.p1, pick.p2, pick.p3] }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMessage(body?.error ?? DEFAULT_ERROR);
        throw new Error("save failed");
      }
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Your podium pick</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {(["p1", "p2", "p3"] as const).map((slot, i) => (
          <label key={slot} className="text-sm text-neutral-400">
            P{i + 1}
            <select
              value={pick[slot]}
              disabled={isLocked}
              onChange={(e) => setPick((prev) => ({ ...prev, [slot]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-white disabled:opacity-60"
            >
              <option value="">Select driver</option>
              {entrants.map((entry) => (
                <option key={entry.driver} value={entry.driver}>
                  {entry.driverName} ({entry.driver})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {!isLocked && (
        <button
          onClick={() => void submit()}
          disabled={status === "saving"}
          className="mt-4 rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save pick"}
        </button>
      )}
      {isLocked && <p className="mt-3 text-xs text-neutral-500">Prediction locked at race start.</p>}
      <AnimatePresence>
        {status === "saved" && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-xs text-neutral-500">
            Saved.
          </motion.p>
        )}
        {status === "error" && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-xs text-[var(--f1-red)]">
            {errorMessage}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
