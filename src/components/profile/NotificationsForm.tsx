"use client";

import { useState } from "react";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[var(--f1-red)]" : "bg-white/10"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-5" : "left-0.5"}`}
      />
    </button>
  );
}

export function NotificationsForm({
  initialNotifyBeforeQualifying,
  initialNotifyOnResults,
}: {
  initialNotifyBeforeQualifying?: boolean;
  initialNotifyOnResults?: boolean;
}) {
  const [notifyBeforeQualifying, setNotifyBeforeQualifying] = useState(!!initialNotifyBeforeQualifying);
  const [notifyOnResults, setNotifyOnResults] = useState(!!initialNotifyOnResults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, boolean>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
        These preferences save now, but emails don&apos;t go out yet — that needs one more piece
        of infrastructure that isn&apos;t wired up yet. Nothing will be lost; notifications will
        start using whatever you&apos;ve set here once it is.
      </div>

      <div className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-white">Before qualifying locks</p>
          <p className="text-xs text-neutral-500">A heads-up before the grid for the next race is set.</p>
        </div>
        <Toggle
          checked={notifyBeforeQualifying}
          onChange={(v) => {
            setNotifyBeforeQualifying(v);
            void save({ notifyBeforeQualifying: v });
          }}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-white">When results land</p>
          <p className="text-xs text-neutral-500">A summary once a race you&apos;ve picked for finishes.</p>
        </div>
        <Toggle
          checked={notifyOnResults}
          onChange={(v) => {
            setNotifyOnResults(v);
            void save({ notifyOnResults: v });
          }}
        />
      </div>

      {saving && <p className="text-xs text-neutral-500">Saving…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
