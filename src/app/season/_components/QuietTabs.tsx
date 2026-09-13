"use client";

/** The one "quiet navigation" control used everywhere the page needs a small switch that
 * shouldn't compete visually with the data around it — entity type, chart metric, chart driver
 * set. Text tabs with a thin red underline on the active one, not a pill/segmented control, so
 * the page isn't reaching for the same rounded-capsule shape every time it needs a toggle. */
export function QuietTabs<T extends string>({
  options,
  value,
  onChange,
  className = "text-sm",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-5 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`relative rounded-sm pb-1.5 font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${active ? "text-white" : "text-neutral-500 hover:text-neutral-300"}`}
          >
            {o.label}
            <span
              className={`absolute inset-x-0 -bottom-px h-px bg-[var(--f1-red)] transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
