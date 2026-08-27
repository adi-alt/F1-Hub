"use client";

import { ERAS } from "@/lib/eras";

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? "border-[var(--f1-red)]/50 bg-[var(--f1-red)]/15 text-white" : "border-white/10 text-neutral-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/** "[All eras] [Front-Engine Era] ..." - reads era.id/name straight off the centralized config
 * (src/lib/eras.ts), never a hardcoded list of its own. Wraps naturally at narrow widths, same as
 * the tab bar above it - a fixed 9-pill row doesn't need a popover to stay usable on mobile. */
export function EraFilterPills({ value, onChange }: { value: string; onChange: (eraId: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterPill active={value === "all"} onClick={() => onChange("all")}>
        All eras
      </FilterPill>
      {ERAS.map((era) => (
        <FilterPill key={era.id} active={value === era.id} onClick={() => onChange(era.id)}>
          {era.name}
        </FilterPill>
      ))}
    </div>
  );
}

/** Driver/team tables' own filter row - just the favorites toggle, no status/country dimension
 * (neither field exists on ArchiveDriver/ArchiveTeam). Kept separate from TrackFilters rather than
 * folding a "favoritesOnly-only" mode into it - the two views' filter needs are different enough
 * that one shared component with half its props unused wouldn't actually be simpler. */
export function FavoritesOnlyToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <FilterPill active={value} onClick={() => onChange(!value)}>
      ★ Favorites
    </FilterPill>
  );
}

const STATUS_OPTIONS: { value: "all" | "active" | "historical"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "historical", label: "Historical" },
];

/** Track view's filter row: active/historical (a small fixed set, pills), country (potentially
 * dozens of values - a native <select> instead of a pill row or a custom combobox; the simplest
 * thing that's already fully accessible and keyboard/touch friendly for "one choice from many"),
 * and a favorites-only toggle. Shows a "Clear filters" action only once something's actually set. */
export function TrackFilters({
  status,
  onStatusChange,
  country,
  onCountryChange,
  countries,
  favoritesOnly,
  onFavoritesOnlyChange,
}: {
  status: "all" | "active" | "historical";
  onStatusChange: (v: "all" | "active" | "historical") => void;
  country: string;
  onCountryChange: (v: string) => void;
  countries: string[];
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (v: boolean) => void;
}) {
  const hasActiveFilters = status !== "all" || country !== "" || favoritesOnly;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((opt) => (
          <FilterPill key={opt.value} active={status === opt.value} onClick={() => onStatusChange(opt.value)}>
            {opt.label}
          </FilterPill>
        ))}
      </div>
      <select
        value={country}
        onChange={(e) => onCountryChange(e.target.value)}
        aria-label="Filter by country"
        className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-300 focus:border-white/30 focus:outline-none"
      >
        <option value="">All countries</option>
        {countries.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <FilterPill active={favoritesOnly} onClick={() => onFavoritesOnlyChange(!favoritesOnly)}>
        ★ Favorites
      </FilterPill>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => {
            onStatusChange("all");
            onCountryChange("");
            onFavoritesOnlyChange(false);
          }}
          className="text-xs text-neutral-500 underline-offset-2 transition hover:text-white hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
