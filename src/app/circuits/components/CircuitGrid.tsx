"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer } from "@/components/motion/variants";
import { CircuitCard } from "./CircuitCard";
import type { CircuitExplorerEntry } from "../services/circuits.service";

type Filter = "all" | "completed" | "next" | "upcoming" | "street" | "night";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "next", label: "Next" },
  { value: "upcoming", label: "Upcoming" },
  { value: "street", label: "Street circuits" },
  { value: "night", label: "Night races" },
];

function matches(entry: CircuitExplorerEntry, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "completed":
      return entry.race.state === "completed";
    case "next":
      return entry.race.state === "next";
    case "upcoming":
      return entry.race.state === "upcoming";
    case "street":
      return entry.facts?.trackType === "street";
    case "night":
      return entry.facts?.nightRace === true;
  }
}

export function CircuitGrid({ entries }: { entries: CircuitExplorerEntry[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Filters that would only ever match nothing (no circuit on this calendar happens to be a night
  // race, say) are simply not offered - an empty filter chip is worse than one fewer chip.
  const availableFilters = useMemo(() => FILTERS.filter((f) => f.value === "all" || entries.some((e) => matches(e, f.value))), [entries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (!matches(e, filter)) return false;
      if (!q) return true;
      const haystack = `${e.race.name} ${e.race.circuit ?? ""} ${e.race.country ?? ""} ${e.facts?.venueName ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, search, filter]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter circuits">
          {availableFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                filter === f.value
                  ? "border-[var(--f1-red)]/45 bg-[var(--f1-red)]/[0.09] text-white"
                  : "border-[var(--f1-line)] text-neutral-400 hover:border-white/20 hover:text-neutral-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search circuits, Grands Prix, countries…"
          aria-label="Search circuits"
          className="h-9 w-full rounded-lg border border-[var(--f1-line)] bg-white/[0.02] px-3 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none sm:w-72"
        />
      </div>

      {visible.length === 0 ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-white/10 px-6 text-center text-sm text-neutral-500">
          {search ? `No circuits match "${search}".` : "No circuits match this filter."}
        </div>
      ) : (
        <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((entry) => (
            <CircuitCard key={entry.race.round} entry={entry} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
