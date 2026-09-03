"use client";

import { EntityMultiSelect, type MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import { ERAS } from "@/lib/eras";

const ERA_OPTIONS: MultiSelectOption[] = [{ code: "all", label: "All eras" }, ...ERAS.map((e) => ({ code: e.id, label: e.name }))];

// The one flat translucent zinc surface Archive's table/cards/tooltip already share - passed to
// every EntityMultiSelect dropdown here so the era/country picker matches instead of standing out
// as the one still-.glass-surface popover on the page.
const DROPDOWN_SURFACE = "border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60";

/** Same compact single-select popover Compare's driver/team pickers use
 * (season/_components/EntityMultiSelect, multiple={false}) instead of a row of always-visible
 * pills - era filtering is secondary to year browsing, so it shouldn't compete for space with the
 * thing the page is actually for. Wrapped in a fixed width so it reads as a small control, not a
 * full-width one (EntityMultiSelect's single-select mode defaults to filling its container, which
 * is right for Compare's two-column "A vs B" row but not for a standalone filter trigger). */
export function EraFilterSelect({ value, onChange }: { value: string; onChange: (eraId: string) => void }) {
  return (
    <div className="w-44">
      <EntityMultiSelect
        multiple={false}
        options={ERA_OPTIONS}
        selected={[value]}
        onChange={(codes) => onChange(codes[0] ?? "all")}
        placeholder="All eras"
        triggerClassName="h-9"
        surfaceClassName={DROPDOWN_SURFACE}
      />
    </div>
  );
}

// h-9 - the one height every control in a filter row (this pill, the country/era EntityMultiSelect
// trigger, the search input in ArchiveExplorer.tsx) shares, so All/Active/Historical/All countries/
// Favorites all line up regardless of their own natural padding/font-size.
function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 items-center rounded-md border px-3 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
        active ? "border-[var(--f1-red)]/50 bg-[var(--f1-red)]/15 text-white" : "border-white/10 text-neutral-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/** Driver/team tables' own filter row - just the favorites toggle, no status/country dimension
 * (neither field exists on ArchiveDriver/ArchiveTeam). A single toggle stays a pill (the exact
 * "select one of two" job a pill is for), unlike era/country's "pick one of many" job above. */
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

/** Track view's filter row: active/historical (3 fixed options - stays pills, the same small,
 * fixed-choice job the favorites toggle above is for) and country (potentially dozens of values -
 * the same EntityMultiSelect popover as the era filter, not a native <select>, so every "pick one
 * from many" control in the app behaves the same way). */
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
  const countryOptions: MultiSelectOption[] = [{ code: "", label: "All countries" }, ...countries.map((c) => ({ code: c, label: c }))];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((opt) => (
          <FilterPill key={opt.value} active={status === opt.value} onClick={() => onStatusChange(opt.value)}>
            {opt.label}
          </FilterPill>
        ))}
      </div>
      <div className="w-44">
        <EntityMultiSelect
          multiple={false}
          options={countryOptions}
          selected={[country]}
          onChange={(codes) => onCountryChange(codes[0] ?? "")}
          placeholder="All countries"
          triggerClassName="h-9"
          surfaceClassName={DROPDOWN_SURFACE}
        />
      </div>
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
