"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { circuitHref } from "@/lib/routes";
import { generateTrackShape } from "@/lib/trackShape";
import type { RaceSummary } from "@/app/season/_service/season.pure";
import type { CircuitExplorerEntry } from "../services/circuits.service";

type Filter = "all" | "completed" | "current" | "upcoming" | "favorites";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "current", label: "Current" },
  { value: "upcoming", label: "Upcoming" },
  { value: "favorites", label: "Favourites" },
];

const PANEL_WIDTH = 268; // px

/** A round's own visual status - distinct from RaceSummary.state, which only ever says
 * completed/next/upcoming and has no notion of "the weekend has started but isn't classified yet"
 * (that's weekendStatus === "live"). A live weekend gets the same focal treatment as "next" - both
 * are "the thing happening right now" from a glance at the season, not two different concepts. */
export type NodeStatus = "completed" | "current" | "upcoming";

export function nodeStatus(race: RaceSummary): NodeStatus {
  if (race.state === "next" || race.weekendStatus === "live") return "current";
  if (race.state === "completed") return "completed";
  return "upcoming";
}

function matchesFilter(entry: CircuitExplorerEntry, filter: Filter, favoriteTracks: string[]): boolean {
  switch (filter) {
    case "all":
      return true;
    case "completed":
      return nodeStatus(entry.race) === "completed";
    case "current":
      return nodeStatus(entry.race) === "current";
    case "upcoming":
      return nodeStatus(entry.race) === "upcoming";
    case "favorites":
      return favoriteTracks.includes(entry.race.circuit ?? entry.race.name);
  }
}

function hoverCapableQuery(): MediaQueryList | null {
  return typeof window !== "undefined" ? window.matchMedia("(hover: hover) and (pointer: fine)") : null;
}

/** True only on a real hover-capable pointer (a mouse) - a touch screen reports `false`, which is
 * what tells CircuitNode to skip the floating preview and rely on selection (updating the always-
 * visible focus panel below) for equivalent information instead - no floating surface to position,
 * clip, or dismiss on touch at all. `useSyncExternalStore` rather than an effect + setState: this
 * is exactly the "subscribe to an external source" case it exists for. */
function useCanHover(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = hoverCapableQuery();
      if (!mq) return () => {};
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => hoverCapableQuery()?.matches ?? true,
    () => true,
  );
}

type HoverState = { key: string; entry: CircuitExplorerEntry; top: number; left: number; flipBelow: boolean };

/**
 * The whole season as one connected, horizontally-scrolling rail - never wraps into a second,
 * visually disconnected row (a `flex-wrap` list was the old failure mode here: 23 rounds wrapping
 * unpredictably based on viewport width broke the season's own chronology into two unrelated-
 * looking lines). Auto-scrolls to the current/next round on mount, so "where is the season right
 * now" is answered without the user doing anything.
 *
 * Clicking or pressing Enter/Space on a round SELECTS it (calls `onSelect`) - it does NOT
 * navigate. Selection drives the focus panel and Ask Apex context a level up; navigating to the
 * full circuit page is the hover/focus preview's own explicit "View circuit →" link, a distinct,
 * deliberate action. Hovering (mouse) or keyboard-focusing a round still opens that same floating
 * preview it always has, for a glance at more detail before committing to a selection.
 */
export function SeasonMap({
  entries,
  favoriteTracks = [],
  selectedRound,
  onSelect,
}: {
  entries: CircuitExplorerEntry[];
  favoriteTracks?: string[];
  selectedRound: number | null;
  onSelect: (round: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [hover, setHover] = useState<HoverState | null>(null);
  const canHover = useCanHover();
  const railRef = useRef<HTMLOListElement>(null);
  const currentNodeRef = useRef<HTMLButtonElement>(null);

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const availableFilters = useMemo(() => FILTERS.filter((f) => f.value !== "favorites" || favoriteTracks.length > 0), [favoriteTracks]);
  const visibleCount = useMemo(() => entries.filter((e) => matchesFilter(e, filter, favoriteTracks)).length, [entries, filter, favoriteTracks]);

  // Bring the current/next round into view on first render - the one round a visitor most wants
  // to see without scrolling the rail themselves. `behavior: "instant"` (no smooth animation) on
  // mount specifically - a page that opens already mid-scroll-animation reads as janky, not premium.
  useEffect(() => {
    currentNodeRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior, inline: "center", block: "nearest" });
  }, []);

  function showPanel(e: MouseEvent | FocusEvent, key: string, entry: CircuitExplorerEntry) {
    const r = e.currentTarget.getBoundingClientRect();
    const idealLeft = r.left + r.width / 2 - PANEL_WIDTH / 2;
    const left = Math.max(8, Math.min(idealLeft, window.innerWidth - PANEL_WIDTH - 8));
    const flipBelow = r.top < 220;
    setHover({ key, entry, top: flipBelow ? r.bottom + 8 : r.top - 8, left, flipBelow });
  }
  function hidePanel(key: string) {
    setHover((prev) => (prev?.key === key ? null : prev));
  }

  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No circuits on this season&apos;s calendar yet.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Season map</p>
        {/* Underline tabs, not filled pills - a quieter treatment for a control that sits right
            above the season's own visual centrepiece. */}
        <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Filter circuits">
          {availableFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter((prev) => (prev === f.value ? "all" : f.value))}
              aria-pressed={filter === f.value}
              className={`border-b-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                filter === f.value ? "border-[var(--f1-red)] text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filter !== "all" && visibleCount === 0 && (
        <p className="mt-2 text-[11px] text-neutral-600">No round currently matches &ldquo;{FILTERS.find((f) => f.value === filter)?.label}&rdquo;.</p>
      )}

      <div aria-hidden className="mt-3 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />

      <ol ref={railRef} className="scrollbar-hide mt-4 flex items-start gap-1 overflow-x-auto pb-2" style={{ scrollSnapType: "x proximity" }}>
        {entries.map((entry) => {
          const dimmed = filter !== "all" && !matchesFilter(entry, filter, favoriteTracks);
          const status = nodeStatus(entry.race);
          return (
            <li key={entry.race.round} className="shrink-0" style={{ scrollSnapAlign: "center" }}>
              <CircuitNode
                ref={status === "current" ? currentNodeRef : undefined}
                entry={entry}
                dimmed={dimmed}
                selected={selectedRound === entry.race.round}
                canHover={canHover}
                onSelect={() => onSelect(entry.race.round)}
                onShow={(e) => showPanel(e, `c${entry.race.round}`, entry)}
                onHide={() => hidePanel(`c${entry.race.round}`)}
              />
            </li>
          );
        })}
      </ol>

      {isClient && createPortal(<AnimatePresence>{hover && <CircuitHoverPanel key={hover.key} state={hover} />}</AnimatePresence>, document.body)}
    </div>
  );
}

function CircuitNode({
  ref,
  entry,
  dimmed,
  selected,
  canHover,
  onSelect,
  onShow,
  onHide,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  entry: CircuitExplorerEntry;
  dimmed: boolean;
  selected: boolean;
  canHover: boolean;
  onSelect: () => void;
  onShow: (e: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => void;
  onHide: () => void;
}) {
  const { race, facts } = entry;
  const status = nodeStatus(race);
  const isCurrent = status === "current";
  const shape = useMemo(
    () => generateTrackShape(race.circuit ?? race.name, facts?.turns ?? 12, facts?.trackType ?? "permanent"),
    [race.circuit, race.name, facts?.turns, facts?.trackType],
  );

  const ringColor = isCurrent ? "text-[var(--f1-red)]" : selected ? "text-white" : status === "completed" ? "text-neutral-300" : "text-neutral-600";
  const strokeWidth = shape.isAuthentic ? (isCurrent ? 6 : 4.5) : isCurrent ? 3.5 : 2.6;

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") onHide();
  }

  return (
    <button
      ref={ref}
      type="button"
      onMouseEnter={canHover ? onShow : undefined}
      onMouseLeave={canHover ? onHide : undefined}
      onFocus={canHover ? onShow : undefined}
      onBlur={canHover ? onHide : undefined}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      aria-label={`Round ${race.round}, ${race.name}, ${status === "completed" ? "completed" : status === "current" ? "next up" : "upcoming"}`}
      aria-pressed={selected}
      className={`group flex shrink-0 flex-col items-center gap-1.5 rounded-lg px-2.5 py-2 text-center transition-[opacity,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
        isCurrent ? "w-28" : "w-24"
      } ${dimmed ? "opacity-30" : "opacity-100"} hover:-translate-y-0.5`}
    >
      <span
        className={`relative flex items-center justify-center rounded-lg ${isCurrent ? "h-20 w-20" : "h-16 w-16"} ${
          selected ? "bg-white/[0.08] ring-1 ring-white/20" : isCurrent ? "bg-[var(--f1-red)]/[0.08]" : status === "completed" ? "bg-white/[0.03]" : "bg-transparent"
        }`}
      >
        {isCurrent && <span aria-hidden className="pulse-ring absolute inset-0 rounded-lg bg-[var(--f1-red)]/20" />}
        <svg viewBox={shape.viewBox || "0 0 100 100"} className={`relative ${ringColor} ${isCurrent ? "h-16 w-16" : "h-12 w-12"}`} aria-hidden>
          <path
            d={shape.path}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={status === "upcoming" ? "3 3" : undefined}
            opacity={status === "upcoming" ? 0.75 : 1}
          />
        </svg>
      </span>
      <span className={`font-mono text-[9px] leading-none ${isCurrent ? "text-[var(--f1-red)]" : "text-neutral-600"}`}>R{race.round}</span>
      <span className={`truncate text-[11px] leading-tight ${isCurrent ? "font-bold text-white" : selected ? "font-semibold text-white" : "font-medium text-neutral-400 group-hover:text-neutral-200"}`}>
        {race.trackShort}
      </span>
    </button>
  );
}

function CircuitHoverPanel({ state }: { state: HoverState }) {
  const { entry, top, left, flipBelow } = state;
  const { race, facts } = entry;
  const status = nodeStatus(race);
  const shape = useMemo(
    () => generateTrackShape(race.circuit ?? race.name, facts?.turns ?? 12, facts?.trackType ?? "permanent"),
    [race.circuit, race.name, facts?.turns, facts?.trackType],
  );
  const location = [race.circuit, race.country].filter(Boolean).join(", ");

  return (
    <div className="pointer-events-none fixed z-[300]" style={{ top, left, width: PANEL_WIDTH, transform: flipBelow ? undefined : "translateY(-100%)" }}>
      <motion.div
        initial={{ opacity: 0, y: flipBelow ? -4 : 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: flipBelow ? -4 : 4, scale: 0.98 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        className="glass-surface pointer-events-auto rounded-lg p-3"
      >
        <p className="font-mono text-[10px] text-neutral-500">Round {race.round}</p>
        <h3 className="mt-0.5 text-[13px] font-semibold leading-snug text-white">{race.name}</h3>
        {location && <p className="text-[11px] text-neutral-500">{location}</p>}

        <div className="my-2.5 flex items-center justify-center rounded-md bg-white/[0.03] py-2">
          <svg viewBox={shape.viewBox || "0 0 100 100"} className="h-16 w-16 text-neutral-300" aria-hidden>
            <path d={shape.path} fill="none" stroke="currentColor" strokeWidth={shape.isAuthentic ? 4 : 3} strokeLinecap="round" />
          </svg>
        </div>

        {status === "completed" ? (
          <div className="space-y-1 text-[11px]">
            {race.winnerName ? (
              <p>
                <span className="text-neutral-500">Winner </span>
                <span className="font-medium text-white">{race.winnerName}</span>
              </p>
            ) : (
              <p className="text-neutral-600">Results not in yet</p>
            )}
            {race.poleSitterName && (
              <p>
                <span className="text-neutral-500">Pole </span>
                <span className="font-medium text-neutral-200">{race.poleSitterName}</span>
              </p>
            )}
            {race.fastestLap?.driverName && (
              <p>
                <span className="text-neutral-500">Fastest lap </span>
                <span className="font-medium text-neutral-200">{race.fastestLap.driverName}</span>
              </p>
            )}
          </div>
        ) : facts ? (
          <p className="text-[11px] text-neutral-500">
            {facts.lengthKm.toFixed(1)} km · {facts.turns} turns · {facts.trackType === "street" ? "Street circuit" : facts.trackType === "hybrid" ? "Hybrid circuit" : "Permanent circuit"}
          </p>
        ) : (
          <p className="text-[11px] text-neutral-600">No track profile yet</p>
        )}

        <Link
          href={circuitHref(race.circuit ?? race.name)}
          className="mt-2.5 block border-t border-white/[0.08] pt-2 text-[11px] font-medium text-neutral-400 transition hover:text-white"
        >
          {status === "completed" ? "Explore race →" : "View circuit →"}
        </Link>
      </motion.div>
    </div>
  );
}
