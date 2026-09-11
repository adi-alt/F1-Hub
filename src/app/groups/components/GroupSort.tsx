"use client";

import { Picker } from "@/components/ui/Picker";

export type SortKey = "active" | "members" | "new";

const OPTIONS: { value: SortKey; label: string; description: string }[] = [
  { value: "active", label: "Most active", description: "Open predictions and posts this week" },
  { value: "members", label: "Most members", description: "Largest communities first" },
  { value: "new", label: "Recently created", description: "Newest communities first" },
];

type Sortable = { memberCount: number; activePredictions: number; weeklyPosts: number; createdAt: string };

/** All three keys are real, already-fetched fields - nothing here is fabricated, and there's no
 * sort offered that the data can't actually back. */
export function sortGroups<T extends Sortable>(groups: T[], key: SortKey): T[] {
  const sorted = [...groups];
  if (key === "members") return sorted.sort((a, b) => b.memberCount - a.memberCount);
  if (key === "new") return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted.sort((a, b) => b.activePredictions + b.weeklyPosts - (a.activePredictions + a.weeklyPosts));
}

/** Was a browser-native <select>, which meant an OS-rendered option list that ignored every one of
 * this app's own surface styles and couldn't show the "what does this sort actually do" line each
 * option now carries. */
export function GroupSort({ value, onChange }: { value: SortKey; onChange: (key: SortKey) => void }) {
  return (
    <Picker
      options={OPTIONS}
      value={value}
      onChange={(next) => onChange(next as SortKey)}
      ariaLabel="Sort communities"
      className="w-52"
      align="end"
    />
  );
}
