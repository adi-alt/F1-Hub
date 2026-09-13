"use client";

import { Picker, type PickerOption } from "@/components/ui/Picker";

/** Both pickers are thin mappings onto Picker, not new dropdown implementations - the keyboard
 * handling, portal positioning, search and empty/disabled states all live in exactly one place.
 * They exist as named components only so "select a driver" and "select a race" look and search the
 * same way everywhere they appear (prediction entry, prediction creation, race-discussion posts)
 * instead of each call site mapping its own options slightly differently. */

export type DriverOption = { code: string; name: string; team?: string; color?: string };

/** Searchable by name, code, or team - `Picker` matches label and description, so the code goes in
 * the label and the team in the description. */
export function DriverPicker({
  drivers,
  value,
  onChange,
  placeholder = "Select driver",
  disabled = false,
  loading = false,
  ariaLabel = "Select driver",
  className = "",
}: {
  drivers: DriverOption[];
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const options: PickerOption[] = drivers.map((d) => ({
    value: d.code,
    label: `${d.name} (${d.code})`,
    description: d.team,
    color: d.color,
  }));

  return (
    <Picker
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search drivers..."
      // A real, specific reason rather than a bare "No matches." - an empty roster means the
      // session data for that race hasn't landed yet, which is a different problem from a typo.
      emptyLabel={drivers.length === 0 ? "No drivers available for this race yet." : "No driver matches that search."}
      disabled={disabled}
      loading={loading}
      clearable
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}

export type RaceOption = { id: string; name: string; round: number; status: string };

/** Split into Upcoming/Past rather than one flat list - "which race" is almost always answered by
 * "the next one" or "the one that just finished", and a 24-row undifferentiated list buries both. */
export function RacePicker({
  races,
  value,
  onChange,
  placeholder = "Select race",
  disabled = false,
  loading = false,
  ariaLabel = "Select race",
  className = "",
}: {
  races: RaceOption[];
  value: string;
  onChange: (raceId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const upcoming = races.filter((r) => r.status !== "completed").sort((a, b) => a.round - b.round);
  const past = races.filter((r) => r.status === "completed").sort((a, b) => b.round - a.round);

  const toOption = (r: RaceOption, group: string): PickerOption => ({
    value: r.id,
    label: r.name,
    description: `Round ${r.round}`,
    badge: r.status === "completed" ? "Completed" : undefined,
    group,
  });

  const options: PickerOption[] = [...upcoming.map((r) => toOption(r, "Upcoming")), ...past.map((r) => toOption(r, "Past races"))];

  return (
    <Picker
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search races..."
      emptyLabel={races.length === 0 ? "No races in this season yet." : "No race matches that search."}
      disabled={disabled}
      loading={loading}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}
