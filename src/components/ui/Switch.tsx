"use client";

/** The site's on/off switch (Settings › Notifications, Manage): brand when on. Named by `label` for screen readers. */
export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 ${checked ? "bg-brand" : "bg-white/10"}`}
    >
      <span aria-hidden className={`absolute top-0.5 size-5 rounded-full bg-white transition-[left] duration-fast motion-reduce:transition-none ${checked ? "left-5" : "left-0.5"}`} />
    </button>
  );
}
