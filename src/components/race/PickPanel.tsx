"use client";

import { useEffect, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import type { RaceDoc, UserPick } from "@/lib/types/race";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

function toFormState(data: UserPick) {
  return { p1: data.predictedPodium[0], p2: data.predictedPodium[1], p3: data.predictedPodium[2] };
}

export function PickPanel({ race }: { race: RaceDoc }) {
  const { user, isAuthorized, loading } = useAuth();
  const [pick, setPick] = useState({ p1: "", p2: "", p3: "" });
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    // isAuthorized, not raw user — Firebase auth resolving mid-OTP-flow isn't a real session yet.
    if (!isAuthorized) return;
    setStatus("loading");
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

  if (loading) return null;

  if (!isAuthorized) {
    return (
      <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-5 text-sm text-neutral-400">
        Sign in to make your own podium pick for this race.
      </div>
    );
  }

  const entrants = race.inputs ?? [];
  if (entrants.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-5 text-sm text-neutral-400">
        Podium picks open once qualifying happens for this race weekend.
      </div>
    );
  }

  const isLocked = race.status !== "upcoming";

  async function submit() {
    if (!user) return;
    if (!pick.p1 || !pick.p2 || !pick.p3 || new Set([pick.p1, pick.p2, pick.p3]).size !== 3) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const data: UserPick = {
        raceId: race.id,
        predictedWinner: pick.p1,
        predictedPodium: [pick.p1, pick.p2, pick.p3],
        submittedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "users", user.uid, "picks", race.id), data);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const actualPodium = race.results
    ? [...race.results].sort((a, b) => a.finishPosition - b.finishPosition).slice(0, 3).map((r) => r.driver)
    : null;

  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-5">
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
      {status === "saved" && <p className="mt-2 text-xs text-neutral-500">Saved.</p>}
      {status === "error" && <p className="mt-2 text-xs text-[var(--f1-red)]">Pick 3 different drivers.</p>}

      {actualPodium && (
        <p className="mt-4 text-xs text-neutral-500">
          Actual podium: {actualPodium.join(", ")} ·{" "}
          {[pick.p1, pick.p2, pick.p3].filter((d) => d && actualPodium.includes(d)).length}/3 hits
        </p>
      )}
    </div>
  );
}
