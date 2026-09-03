"use client";

export type SortKey = "active" | "members" | "new";

const OPTIONS: { value: SortKey; label: string }[] = [
  { value: "active", label: "Most active" },
  { value: "members", label: "Most members" },
  { value: "new", label: "Recently created" },
];

type Sortable = { memberCount: number; activePredictions: number; weeklyPosts: number; createdAt: string };

/** All three keys are real, already-fetched fields - no "most predictions" or "most discussed"
 * filter on top (the request's own "do not overcomplicate" note), and nothing here is fabricated. */
export function sortGroups<T extends Sortable>(groups: T[], key: SortKey): T[] {
  const sorted = [...groups];
  if (key === "members") return sorted.sort((a, b) => b.memberCount - a.memberCount);
  if (key === "new") return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted.sort((a, b) => b.activePredictions + b.weeklyPosts - (a.activePredictions + a.weeklyPosts));
}

export function GroupSort({ value, onChange }: { value: SortKey; onChange: (key: SortKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2.5 text-sm text-neutral-300 focus:border-white/30 focus:outline-none"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[var(--f1-carbon)]">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
