"use client";

import { useMemo, useState } from "react";
import { FilterPill, Popover } from "@/components/ui/Popover";

/** Real facets from real rows - `count` is how many public communities actually carry that topic,
 * computed server-side across the current search. A topic with no communities never appears here,
 * so this list can't offer a filter that returns nothing. */
export type Facet = { topic: string; count: number };

/**
 * Topics as a popover of searchable checkboxes rather than a permanently-visible row of chips -
 * the explicit ask was that filters not sit on screen as ugly always-on controls.
 *
 * Selections apply immediately (no Apply button): the grid behind the popover updates as you tick,
 * which is what makes "is this filter worth keeping" answerable without closing anything.
 */
export function TopicFilter({
  facets,
  selected,
  onChange,
}: {
  facets: Facet[];
  selected: string[];
  onChange: (topics: string[]) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? facets.filter((f) => f.topic.toLowerCase().includes(q)) : facets;
  }, [facets, query]);

  const selectedSet = new Set(selected);

  function toggle(topic: string) {
    onChange(selectedSet.has(topic) ? selected.filter((t) => t !== topic) : [...selected, topic]);
  }

  return (
    <Popover
      ariaLabel="Filter by topic"
      panelClassName="w-64"
      trigger={({ open, toggle: toggleOpen, ref }) => <FilterPill label="Topics" count={selected.length} open={open} onClick={toggleOpen} buttonRef={ref} />}
    >
      {() => (
        <>
          {/* The search box only earns its space once there are enough topics to hunt through. */}
          {facets.length >= 8 && (
            <div className="shrink-0 border-b border-white/10 p-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search topics..."
                aria-label="Search topics"
                autoFocus
                className="w-full rounded-lg bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none"
              />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-neutral-500">
                {facets.length === 0 ? "No topics on any community yet." : "No topic matches that."}
              </p>
            ) : (
              filtered.map((facet) => {
                const checked = selectedSet.has(facet.topic);
                return (
                  <label
                    key={facet.topic}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-neutral-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(facet.topic)} className="sr-only" />
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        checked ? "border-[var(--f1-red)] bg-[var(--f1-red)]" : "border-white/25"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 14 14" className="h-3 w-3 text-white" fill="none">
                          <path d="M3 7.2 5.6 9.8 11 4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{facet.topic}</span>
                    <span className="shrink-0 text-[11px] text-neutral-600 tabular-nums">{facet.count}</span>
                  </label>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="shrink-0 border-t border-white/10 p-2">
              <button type="button" onClick={() => onChange([])} className="w-full rounded-lg px-2 py-1.5 text-xs text-neutral-400 transition hover:bg-white/[0.05] hover:text-white">
                Clear {selected.length} topic{selected.length === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </>
      )}
    </Popover>
  );
}
