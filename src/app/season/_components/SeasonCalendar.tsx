"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { raceHref } from "@/lib/routes";
import { useFavDriverIds } from "@/queries/favorites/useFavorites";
import type { DriverStandingRow, RaceSummary } from "../_service/season.service";

type SessionType = "practice" | "qualifying" | "sprint" | "race";

// Restrained, not a rainbow: one hue family per session type, an F1-red reserved for race day.
const TYPE_COLOR: Record<SessionType, string> = {
  practice: "#3987e5",
  qualifying: "#8b5cf6",
  sprint: "#eab308",
  race: "var(--f1-red)",
};

function sessionType(code: string): SessionType {
  if (code === "R") return "race";
  if (code.startsWith("S")) return "sprint";
  if (code === "Q") return "qualifying";
  return "practice";
}

type DaySession = {
  round: number;
  raceName: string;
  circuit: string;
  label: string;
  code: string;
  date: Date;
  state: "completed" | "current" | "upcoming";
};

const GAP = 3; // px, fixed - only the cell itself scales
const MIN_CELL = 9; // px - stays a legible square even when many weeks force horizontal scroll
// Bigger than GitHub's own ~11px (a full F1 season is ~40-42 weeks, see season.service.ts, and
// this app's own max-w-[1200px] page already caps how wide the container can get), but pulled
// back from an earlier pass that filled the *entire* measured width (~23-24px raw) - that read as
// chunky rather than GitHub-proportioned. This sits below that raw value on purpose, so the clamp
// still applies and tiles stay a legible-but-compact square instead of stretching edge to edge.
const MAX_CELL = 18; // px
const DEFAULT_CELL = 12; // px - server-rendered guess before the client can measure real width
const TOOLTIP_WIDTH = 224; // px, matches the w-56 tooltip below
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VISIBLE_DAY_LABELS = new Set([1, 3, 5]); // Mon/Wed/Fri, GitHub's own convention

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Measures a node's real content width, live, via ResizeObserver - the calendar grid's cell
 * size is computed from this instead of a fixed pixel value, so the grid actually fills its
 * container's real width (clamped between MIN_CELL/MAX_CELL) rather than shrink-wrapping to a
 * small corner of it with dead space on the right. */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** The season at a glance, built the way GitHub's contribution graph actually works: the visual
 * primitive is the DATE, not the race, arranged as week-columns x weekday-rows so the whole
 * season's real chronology and density read in one glance. A date with a session gets a small
 * colored cell (hue = session type, fill/border/pulse = completed/upcoming/current); a date with
 * several sessions (a Friday practice double-header, a sprint Saturday) splits the same cell into
 * stacked slices instead of cramming text in. Hovering/focusing a cell drives one shared floating
 * tooltip (not hundreds of individual ones); clicking navigates straight to that race's own
 * dedicated page - this calendar doesn't expand anything inline anymore (every race opens on its
 * own route now, current season included, same as Archive). */
export function SeasonCalendar({ year, drivers, raceSummaries }: { year: number; drivers: DriverStandingRow[]; raceSummaries: RaceSummary[] }) {
  const router = useRouter();
  const favDrivers = useFavDriverIds();
  const [hover, setHover] = useState<{ key: string; date: Date; sessions: DaySession[]; top: number; left: number; flipBelow: boolean } | null>(null);
  const scrollRef = useNestedLenisScroll(year, { orientation: "horizontal", gestureOrientation: "horizontal" });
  const { ref: widthProbeRef, width: availableWidth } = useMeasuredWidth<HTMLDivElement>();
  // Same createPortal(..., document.body) SSR guard as every other floating panel fixed this
  // session (EntityMultiSelect, the year-card tooltip) - document.body is a real crash during SSR
  // if this were called unconditionally, not a hypothetical one.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const allSessions = useMemo<DaySession[]>(
    () =>
      raceSummaries.flatMap((r) =>
        r.sessions.map((s) => ({ round: r.round, raceName: r.name, circuit: r.trackShort, label: s.label, code: s.code, date: new Date(s.date), state: s.state })),
      ),
    [raceSummaries],
  );

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, DaySession[]>();
    for (const s of allSessions) {
      const key = dateKey(s.date);
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) list.sort((a, b) => a.date.getTime() - b.date.getTime());
    return map;
  }, [allSessions]);

  const favoriteIdByCode = useMemo(() => new Map(drivers.map((d) => [d.driver, d.favoriteId])), [drivers]);
  const favoritePodiumRounds = useMemo(() => {
    const rounds = new Set<number>();
    for (const r of raceSummaries) {
      if (r.results.some((res) => res.finishPosition <= 3 && res.driver && favoriteIdByCode.get(res.driver) && favDrivers.has(favoriteIdByCode.get(res.driver)!))) {
        rounds.add(r.round);
      }
    }
    return rounds;
  }, [raceSummaries, favoriteIdByCode, favDrivers]);

  // Full weeks (Sunday to Saturday), GitHub's own week-column convention, spanning every session
  // date the season actually has, plus month labels computed from real dates, not fixed offsets.
  const { weeks, monthLabels } = useMemo(() => {
    if (allSessions.length === 0) return { weeks: [] as Date[][], monthLabels: [] as { weekIndex: number; label: string }[] };
    const times = allSessions.map((s) => s.date.getTime());
    const start = startOfDay(new Date(Math.min(...times)));
    start.setDate(start.getDate() - start.getDay());
    const end = startOfDay(new Date(Math.max(...times)));
    end.setDate(end.getDate() + (6 - end.getDay()));

    const weeks: Date[][] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    const monthLabels: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const month = week[0].getMonth();
      if (month !== lastMonth) {
        monthLabels.push({ weekIndex: i, label: week[0].toLocaleDateString(undefined, { month: "short" }) });
        lastMonth = month;
      }
    });

    return { weeks, monthLabels };
  }, [allSessions]);

  // Fill the measured available width instead of shrink-wrapping to a small, fixed 11px-cell
  // block - clamped so a season with very few weeks (or a very wide screen) doesn't blow the
  // tiles up into oversized rectangles, and a season with many weeks (or a narrow screen) still
  // gets a legible minimum, falling back to horizontal scroll rather than shrinking further.
  const weekCount = Math.max(weeks.length, 1);
  const cell = useMemo(() => {
    if (availableWidth == null) return DEFAULT_CELL;
    const raw = Math.floor((availableWidth - (weekCount - 1) * GAP) / weekCount);
    return Math.max(MIN_CELL, Math.min(MAX_CELL, raw));
  }, [availableWidth, weekCount]);
  const col = cell + GAP;

  // Viewport-fixed coordinates straight from the hovered cell's own getBoundingClientRect() - no
  // local anchor to measure against, so this can never be clipped by an ancestor's overflow the
  // way an anchor-relative absolute position could be (the exact fix already applied to the
  // year-card tooltip, applied here defensively - this calendar sits inside no overflow-hidden
  // ancestor today, but the mechanism itself is what's now audited/shared, not a per-component guess).
  function showTooltip(e: MouseEvent | FocusEvent, key: string, date: Date, sessions: DaySession[]) {
    const r = e.currentTarget.getBoundingClientRect();
    const idealLeft = r.left + r.width / 2 - TOOLTIP_WIDTH / 2;
    const left = Math.max(8, Math.min(idealLeft, window.innerWidth - TOOLTIP_WIDTH - 8));
    const flipBelow = r.top < 160;
    setHover({ key, date, sessions, top: flipBelow ? r.bottom + 8 : r.top - 8, left, flipBelow });
  }
  function hideTooltip(key: string) {
    setHover((prev) => (prev?.key === key ? null : prev));
  }
  function goToRace(sessions: DaySession[]) {
    const first = sessions[0];
    if (!first) return;
    router.push(raceHref(year, first.round, first.raceName));
  }

  const hoverRace = hover ? raceSummaries.find((r) => r.round === hover.sessions[0]?.round) : undefined;
  const hoverWinner = hoverRace?.results.find((r) => r.finishPosition === 1);

  if (allSessions.length === 0) {
    return <p className="text-sm text-neutral-500">No calendar data yet for {year}.</p>;
  }

  return (
    <div>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Season calendar</p>

      {/* Same solid, bordered treatment (and full page width) as the standings table above it —
          the grid's own natural content width is much narrower than that, so without an explicit
          full-width container here it read as a stray, differently-sized block on the page. */}
      <div className="w-full rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-5">
        <div className="flex gap-2">
          <div className="flex shrink-0 flex-col gap-[3px]" style={{ marginTop: 18 }}>
            {DAY_LABELS.map((label, i) => (
              <div key={label} style={{ height: cell }} className="flex items-center text-[9px] leading-none text-neutral-600">
                {VISIBLE_DAY_LABELS.has(i) ? label.slice(0, 3) : ""}
              </div>
            ))}
          </div>

          <div ref={widthProbeRef} className="min-w-0 flex-1">
            <div ref={scrollRef} className="overflow-x-auto scrollbar-hide">
              <div className="mx-auto" style={{ width: weeks.length * col - GAP }}>
                <div className="relative" style={{ height: 18 }}>
                  {monthLabels.map((m) => (
                    <span key={m.weekIndex} className="absolute top-0 text-[10px] text-neutral-600" style={{ left: m.weekIndex * col }}>
                      {m.label}
                    </span>
                  ))}
                </div>
                <div className="flex" style={{ gap: GAP }}>
                  {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                      {week.map((day) => {
                        const key = dateKey(day);
                        const sessions = sessionsByDate.get(key);
                        const isFavPodium = sessions?.some((s) => favoritePodiumRounds.has(s.round)) ?? false;
                        return (
                          <DayCell
                            key={key}
                            date={day}
                            size={cell}
                            sessions={sessions}
                            isFavoritePodium={isFavPodium}
                            onEnter={(e) => showTooltip(e, key, day, sessions ?? [])}
                            onLeave={() => hideTooltip(key)}
                            onClick={() => sessions && goToRace(sessions)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[10px] text-neutral-500">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-[10px] w-[10px] rounded-[2px] bg-white/[0.05]" />
              No session
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[10px] w-[10px] rounded-[2px] border border-neutral-500" />
              Upcoming
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[10px] w-[10px] rounded-[2px] bg-neutral-400" />
              Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="pulse-ring h-[10px] w-[10px] rounded-[2px] bg-[var(--f1-red)]" />
              Current
            </span>
          </span>
          <span className="flex items-center gap-3">
            {(["practice", "qualifying", "sprint", "race"] as const).map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: TYPE_COLOR[t] }} />
                <span className="capitalize">{t}</span>
              </span>
            ))}
          </span>
        </div>
      </div>

      {isClient &&
        createPortal(
          <AnimatePresence>
            {hover && (
              <div
                className="pointer-events-none fixed z-[300]"
                style={{
                  top: hover.top,
                  left: hover.left,
                  width: TOOLTIP_WIDTH,
                  transform: hover.flipBelow ? undefined : "translateY(-100%)",
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: hover.flipBelow ? -4 : 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: hover.flipBelow ? -4 : 4, scale: 0.98 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="glass-surface rounded-lg p-3"
                >
                  <p className="text-[11px] font-semibold text-white">{hover.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
                  {hover.sessions.length === 0 ? (
                    <p className="mt-1 text-[10px] text-neutral-500">No F1 session</p>
                  ) : (
                    <>
                      <p className="text-[10px] text-neutral-500">
                        Round {hover.sessions[0]?.round} · {hover.sessions[0]?.raceName}
                      </p>
                      <p className="text-[10px] text-neutral-600">{hover.sessions[0]?.circuit}</p>
                      <div className="mt-2 flex flex-col gap-1">
                        {hover.sessions.map((s) => (
                          <div key={s.label} className="flex items-center justify-between gap-3 text-xs">
                            <span className="flex items-center gap-1.5 text-neutral-300">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[sessionType(s.code)] }} />
                              {s.label}
                              {s.state === "upcoming" && (
                                <span className="rounded-sm bg-white/[0.06] px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Upcoming</span>
                              )}
                            </span>
                            <span className="font-mono tabular-nums text-neutral-500">{s.date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {hoverWinner ? (
                    <p className="mt-2 border-t border-white/[0.08] pt-2 text-xs text-neutral-300">
                      Winner: <span className="font-medium text-white">{hoverWinner.driverName}</span>
                    </p>
                  ) : (
                    hover.sessions.length > 0 && (
                      <p className="mt-2 border-t border-white/[0.08] pt-2 text-xs text-neutral-500">
                        {hover.sessions.some((s) => s.state === "upcoming") ? "Upcoming, not yet run" : "Results not in yet"}
                      </p>
                    )
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function DayCell({
  date,
  size,
  sessions,
  isFavoritePodium,
  onEnter,
  onLeave,
  onClick,
}: {
  date: Date;
  size: number;
  sessions: DaySession[] | undefined;
  isFavoritePodium: boolean;
  onEnter: (e: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const dayLabel = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const hasSessions = !!sessions && sessions.length > 0;
  // Empty days still get the hover tooltip (date + "no F1 session") - just no click action, since
  // there's nothing to open.
  const ariaLabel = hasSessions ? `${dayLabel}: ${sessions.map((s) => `${s.label}, ${s.state}`).join("; ")}` : `${dayLabel}: no F1 session`;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={hasSessions ? onClick : undefined}
      style={{ width: size, height: size, boxShadow: isFavoritePodium ? "0 0 0 1px rgba(251,191,36,0.65)" : undefined }}
      className={`flex flex-col overflow-hidden rounded-[3px] transition-transform duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/70 ${
        hasSessions ? "cursor-pointer hover:scale-110 focus-visible:scale-110" : "cursor-default"
      }`}
    >
      {hasSessions ? sessions.map((s) => <SessionSlice key={s.label} session={s} />) : <span className="h-full w-full bg-white/[0.05]" />}
    </button>
  );
}

function SessionSlice({ session }: { session: DaySession }) {
  const color = TYPE_COLOR[sessionType(session.code)];
  const upcoming = session.state === "upcoming";
  return (
    <span
      className={`flex-1 ${session.state === "current" ? "pulse-ring" : ""}`}
      style={upcoming ? { border: `1px solid ${color}`, opacity: 0.7 } : { background: color }}
    />
  );
}
