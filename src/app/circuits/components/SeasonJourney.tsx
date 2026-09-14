"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { circuitHref } from "@/lib/routes";
import { parseUtcDateTime } from "@/lib/countdown";
import { generateTrackShape } from "@/lib/trackShape";
import type { RaceSummary } from "@/app/season/_service/season.pure";
import type { CircuitExplorerEntry } from "../services/circuits.service";

type Filter = "all" | "completed" | "next" | "upcoming" | "favorites";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "next", label: "Next" },
  { value: "upcoming", label: "Upcoming" },
  { value: "favorites", label: "Favourites" },
];

const PANEL_WIDTH = 268; // px

/** A round's own visual status - distinct from RaceSummary.state, which only ever says
 * completed/next/upcoming and has no notion of "the weekend has started but isn't classified yet"
 * (that's weekendStatus === "live"). A live weekend gets the same focal treatment as "next" - both
 * are "the thing happening right now" from a glance at the season, not two different concepts. */
type NodeStatus = "completed" | "current" | "upcoming";

function nodeStatus(race: RaceSummary): NodeStatus {
  if (race.state === "next" || race.weekendStatus === "live") return "current";
  if (race.state === "completed") return "completed";
  return "upcoming";
}

function matchesFilter(entry: CircuitExplorerEntry, filter: Filter, favoriteTracks: string[]): boolean {
  switch (filter) {
    case "all":
      return true;
    case "completed":
      return entry.race.state === "completed";
    case "next":
      return entry.race.state === "next";
    case "upcoming":
      return entry.race.state === "upcoming";
    case "favorites":
      return favoriteTracks.includes(entry.race.circuit ?? entry.race.name);
  }
}

/** This weekend's real session dates, not a single race-day point - "Race Weekend, 11–13 Sept"
 * reads as an actual multi-day event the way a bare race date doesn't. Falls back to the race date
 * alone when no session schedule exists yet (a placeholder round the calendar hasn't detailed). */
function weekendDateRange(race: RaceSummary): string | null {
  const dates = race.sessions.map((s) => parseUtcDateTime(s.date)).filter((d) => !Number.isNaN(d.getTime()));
  if (dates.length === 0) {
    return race.raceDate ? parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;
  }
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.toDateString() === last.toDateString()) {
    return first.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  const sameMonth = first.getMonth() === last.getMonth();
  const firstStr = first.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const lastStr = last.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${firstStr}–${lastStr}`;
}

function hoverCapableQuery(): MediaQueryList | null {
  return typeof window !== "undefined" ? window.matchMedia("(hover: hover) and (pointer: fine)") : null;
}

/** True only on a real hover-capable pointer (a mouse) - a touch screen reports `false`, which is
 * what tells CircuitNode to open its panel on tap instead of swallowing the first tap as a hover
 * that never fires. `useSyncExternalStore` rather than an effect + setState: this is exactly the
 * "subscribe to an external source" case it exists for, and it's what keeps the initial read
 * synchronous with render instead of a real, avoidable extra render every mount would otherwise
 * cost. Defaults to `true` for the SSR snapshot (no layout depends on this - it only changes which
 * event opens the panel, never what renders), corrected the moment the client can actually check,
 * same isClient pattern this file's floating panel already needs for `document.body`. */
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

type HoverState = { key: string; entry: CircuitExplorerEntry; top: number; left: number; flipBelow: boolean; viaTap: boolean };

/** The season as one connected, wrapping rail of every round in calendar order - the primary
 * visualization the Circuits homepage is built around, replacing the old vertical stack of large
 * cards (CircuitExplorerTimeline) that forced scrolling through 20+ full-width blocks to see the
 * whole season. Every round is always rendered (filtering dims rather than removes - see
 * matchesFilter's own call site below), so the season's real chronology never disappears just
 * because a filter is active. Hovering/focusing/tapping a node opens one shared floating
 * intelligence panel (real results for a completed round, real circuit facts for one still to
 * come) - the same viewport-anchored, portal-rendered, edge-flipping mechanism SeasonCalendar's
 * own day-cell tooltip already uses, extended with a tap-to-preview mode for touch. */
export function SeasonJourney({ entries, favoriteTracks = [] }: { entries: CircuitExplorerEntry[]; favoriteTracks?: string[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [hover, setHover] = useState<HoverState | null>(null);
  const canHover = useCanHover();
  const containerRef = useRef<HTMLDivElement>(null);

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const availableFilters = useMemo(
    () => FILTERS.filter((f) => f.value !== "favorites" || favoriteTracks.length > 0),
    [favoriteTracks],
  );

  const visibleCount = useMemo(() => entries.filter((e) => matchesFilter(e, filter, favoriteTracks)).length, [entries, filter, favoriteTracks]);

  function showPanel(e: MouseEvent | FocusEvent, key: string, entry: CircuitExplorerEntry, viaTap: boolean) {
    const r = e.currentTarget.getBoundingClientRect();
    const idealLeft = r.left + r.width / 2 - PANEL_WIDTH / 2;
    const left = Math.max(8, Math.min(idealLeft, window.innerWidth - PANEL_WIDTH - 8));
    const flipBelow = r.top < 220;
    setHover({ key, entry, top: flipBelow ? r.bottom + 8 : r.top - 8, left, flipBelow, viaTap });
  }
  function hidePanel(key: string) {
    setHover((prev) => (prev?.key === key ? null : prev));
  }

  // Tap-to-preview only: a real mouse click never reaches here (canHover short-circuits it in
  // CircuitNode below), so this exclusively handles "close the open panel when a touch user taps
  // anywhere outside it" - closing on blur alone doesn't cover touch, which has no focus-follows-
  // pointer concept the way a mouse does.
  useEffect(() => {
    if (!hover?.viaTap) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setHover(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [hover?.viaTap]);

  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No circuits on this season&apos;s calendar yet.</p>;
  }

  return (
    <div ref={containerRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Season journey</p>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter circuits">
          {availableFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter((prev) => (prev === f.value ? "all" : f.value))}
              aria-pressed={filter === f.value}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                filter === f.value ? "bg-[var(--f1-red)]/[0.12] text-white" : "text-neutral-500 hover:text-neutral-300"
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

      <ol className="mt-4 flex flex-wrap items-start gap-y-3">
        {entries.map((entry, i) => {
          const dimmed = filter !== "all" && !matchesFilter(entry, filter, favoriteTracks);
          return (
            <li key={entry.race.round} className="flex items-start">
              {i > 0 && <span aria-hidden className="mt-6 h-px w-2 shrink-0 bg-white/[0.08] sm:w-3" />}
              <CircuitNode
                entry={entry}
                dimmed={dimmed}
                canHover={canHover}
                isHovered={hover?.key === `c${entry.race.round}`}
                onShow={(e, viaTap) => showPanel(e, `c${entry.race.round}`, entry, viaTap)}
                onHide={() => hidePanel(`c${entry.race.round}`)}
              />
            </li>
          );
        })}
      </ol>

      {isClient &&
        createPortal(
          <AnimatePresence>{hover && <CircuitHoverPanel key={hover.key} state={hover} />}</AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function CircuitNode({
  entry,
  dimmed,
  canHover,
  isHovered,
  onShow,
  onHide,
}: {
  entry: CircuitExplorerEntry;
  dimmed: boolean;
  canHover: boolean;
  isHovered: boolean;
  onShow: (e: MouseEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>, viaTap: boolean) => void;
  onHide: () => void;
}) {
  const { race, facts } = entry;
  const status = nodeStatus(race);
  const isCurrent = status === "current";
  const shape = useMemo(
    () => generateTrackShape(race.circuit ?? race.name, facts?.turns ?? 12, facts?.trackType ?? "permanent"),
    [race.circuit, race.name, facts?.turns, facts?.trackType],
  );

  const ringColor = isCurrent ? "text-[var(--f1-red)]" : status === "completed" ? "text-neutral-300" : "text-neutral-600";
  const strokeWidth = shape.isAuthentic ? (isCurrent ? 5 : 3.5) : isCurrent ? 3 : 2.2;

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (canHover) return; // a real mouse click just navigates, same as any link
    if (!isHovered) {
      e.preventDefault();
      onShow(e, true);
    }
    // already open (this is the confirming second tap) - let the Link navigate normally
  }

  function handleKeyDown(e: KeyboardEvent<HTMLAnchorElement>) {
    if (e.key === "Escape") onHide();
  }

  return (
    <Link
      href={circuitHref(race.circuit ?? race.name)}
      onMouseEnter={canHover ? (e) => onShow(e, false) : undefined}
      onMouseLeave={canHover ? onHide : undefined}
      // Gated on canHover, same as the mouse handlers above: on a touch device, a tap fires
      // focus and click as two separate native events in the same gesture, and focus opening the
      // panel here would make `isHovered` already true by the time handleClick's own tap-to-
      // preview check runs, defeating it and navigating on the very first tap. A device with a
      // real keyboard is also, in practice, a hover-capable one, so this doesn't cost real
      // keyboard-focus support - see useCanHover's own media query.
      onFocus={canHover ? (e) => onShow(e, false) : undefined}
      onBlur={canHover ? onHide : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Round ${race.round}, ${race.name}, ${status === "completed" ? "completed" : status === "current" ? "next up" : "upcoming"}`}
      className={`group flex shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-center transition-[opacity,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
        isCurrent ? "w-20" : "w-16"
      } ${dimmed ? "opacity-30" : "opacity-100"} hover:-translate-y-0.5`}
    >
      <span
        className={`relative flex items-center justify-center rounded-md ${isCurrent ? "h-14 w-14" : "h-11 w-11"} ${
          isCurrent ? "bg-[var(--f1-red)]/[0.08]" : status === "completed" ? "bg-white/[0.03]" : "bg-transparent"
        }`}
      >
        {isCurrent && <span aria-hidden className="pulse-ring absolute inset-0 rounded-md bg-[var(--f1-red)]/20" />}
        <svg viewBox={shape.viewBox || "0 0 100 100"} className={`relative ${ringColor} ${isCurrent ? "h-10 w-10" : "h-7 w-7"}`} aria-hidden>
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
      <span className={`truncate text-[11px] leading-tight ${isCurrent ? "font-bold text-white" : "font-medium text-neutral-400 group-hover:text-neutral-200"}`}>
        {race.trackShort}
      </span>
    </Link>
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
  const dateRange = weekendDateRange(race);

  return (
    <div
      className="pointer-events-none fixed z-[300]"
      style={{ top, left, width: PANEL_WIDTH, transform: flipBelow ? undefined : "translateY(-100%)" }}
    >
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
        ) : (
          <div className="space-y-1 text-[11px]">
            {dateRange && (
              <p>
                <span className="text-neutral-500">Race weekend </span>
                <span className="font-medium text-neutral-200">{dateRange}</span>
              </p>
            )}
            {facts ? (
              <p className="text-neutral-500">
                {facts.lengthKm.toFixed(1)} km · {facts.turns} turns · {facts.trackType === "street" ? "Street circuit" : facts.trackType === "hybrid" ? "Hybrid circuit" : "Permanent circuit"}
              </p>
            ) : (
              <p className="text-neutral-600">No track profile yet</p>
            )}
          </div>
        )}

        <p className="mt-2.5 border-t border-white/[0.08] pt-2 text-[11px] font-medium text-neutral-400">
          {status === "completed" ? "Explore race →" : "View circuit →"}
        </p>
      </motion.div>
    </div>
  );
}
