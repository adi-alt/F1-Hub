"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { PANEL } from "@/components/ui/panel";

function Toggle({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${checked ? "bg-brand" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-[left] duration-fast ${checked ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

const ROWS = [
  { key: "notifyBeforeQualifying", title: "Before qualifying locks", body: "A heads-up before the grid for the next race is set, while picks are still open." },
  { key: "notifyOnResults", title: "When results land", body: "A summary once a race you've picked for is over." },
] as const;

/** Email preferences: each switch saves as it's flipped (PATCH /api/users/me), and puts itself back if the save
 * fails. The emails themselves aren't sent yet, which the page says rather than implying otherwise. */
export function NotificationsForm({ initialNotifyBeforeQualifying, initialNotifyOnResults }: { initialNotifyBeforeQualifying?: boolean; initialNotifyOnResults?: boolean }) {
  const [values, setValues] = useState({ notifyBeforeQualifying: !!initialNotifyBeforeQualifying, notifyOnResults: !!initialNotifyOnResults });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(key: keyof typeof values, value: boolean) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch {
      setValues((v) => ({ ...v, [key]: !value }));
      setError("Couldn't save that change. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <ul className={`divide-y divide-white/[0.06] ${PANEL}`}>
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p id={`notify-${row.key}`} className="text-body-sm font-medium text-primary">
                {row.title}
              </p>
              <p className="mt-0.5 text-caption text-tertiary">{row.body}</p>
            </div>
            <Toggle checked={values[row.key]} onChange={(v) => void set(row.key, v)} labelledBy={`notify-${row.key}`} />
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 text-caption text-tertiary">
        <Icon icon={Info} size={16} className="mt-px size-3.5" />
        <span>Your choices are saved now. The emails themselves start once sending is switched on; nothing you set here is lost before then.</span>
      </p>
      <p aria-live="polite" className="mt-2 min-h-4 text-caption">
        {error ? <span className="text-danger">{error}</span> : saving ? <span className="text-tertiary">Saving…</span> : null}
      </p>
    </div>
  );
}
