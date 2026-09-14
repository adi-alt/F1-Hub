"use client";

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { raceHref } from "@/lib/routes";
import { parseUtcDateTime } from "@/lib/countdown";
import { useSeasonExplorer } from "../../_context/SeasonExplorerContext";
import { buildPredictionReview, type DriverStandingRow, type RaceSummary, type RaceWeekendStatus } from "../../_service/season.pure";
import { buildRaceInsights } from "../../_service/seasonAnalytics";
import { RaceMedia } from "./RaceMedia";
import { RaceTimeline } from "./RaceTimeline";
import { RaceWeather } from "./RaceWeather";
import { RacePredictionReview } from "./RacePredictionReview";
import { RaceApexTake } from "./RaceApexTake";

const STATUS_LABEL: Record<RaceWeekendStatus, string> = {
  upcoming: "Upcoming",
  live: "Weekend under way",
  completed: "Completed",
  cancelled: "Cancelled",
  postponed: "Postponed",
};

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The race detail window.
 *
 * Replaces the full-height right-hand drawer, which behaved like an application settings panel:
 * it covered the page edge to edge vertically, hid the content behind it, and had nothing to do
 * with the composition of the page it appeared over. This is a constrained floating window on
 * desktop (the page stays visible and legible around it) and a bottom sheet on phones, where a
 * sheet is the native idiom.
 *
 * Its open/closed state is the URL — see SeasonExplorerProvider. That is what makes a hard refresh
 * land back on the same window, a shared link open it directly, and browser back close it. Modal
 * state held in a component could do none of those.
 *
 * Focus is trapped while open and restored to the element that opened it on close, and Escape
 * closes it — the three things a dialog has to get right and the previous drawer did none of.
 */
export function RaceQuickView({ season, raceSummaries, drivers }: { season: number; raceSummaries: RaceSummary[]; drivers: DriverStandingRow[] }) {
  const { openRaceRound, closeRace } = useSeasonExplorer();
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // document.body doesn't exist during SSR, so the portal is gated on a real client commit rather
  // than a typeof window check inside render.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const race = openRaceRound !== null ? raceSummaries.find((r) => r.round === openRaceRound) : undefined;
  const isOpen = !!race;

  // Remember what had focus BEFORE the window opened, so it can be handed back on close.
  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRace();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Wrap at both ends, so Tab can never escape the dialog into the page behind it.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [closeRace],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", onKeyDown, true);

    // The page behind a modal must not scroll under it. It is NOT the document body that scrolls
    // in this app (the root layout makes body overflow-hidden and SmoothScroll owns a scrolling
    // div inside it), so freezing body overflow here would do nothing at all.
    const scroller = document.querySelector<HTMLElement>("[data-app-scroll]");
    const previousOverflow = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";

    // Move focus into the dialog on open, so a keyboard user isn't left behind on the page.
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (scroller) scroller.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [isOpen, onKeyDown]);

  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {race && (
        <div key="race-window" className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            aria-hidden
            onClick={closeRace}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            // Dimmed, not blacked out: keeping the page readable behind the window is the whole
            // point of it being a window rather than a drawer.
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-white/[0.1] bg-[rgba(20,20,23,0.92)] shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:max-h-[88vh] sm:w-[92vw] sm:max-w-[56rem] sm:rounded-lg lg:max-w-[68rem]"
          >
            {/* Phone-only drag affordance - the sheet reads as grabbable even though dismissal is
                the sticky close button and the backdrop. */}
            <div aria-hidden className="flex shrink-0 justify-center pt-2.5 sm:hidden">
              <span className="h-1 w-9 rounded-full bg-white/20" />
            </div>

            <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-3 sm:px-7 sm:pt-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Round {race.round}
                  {race.isSprintWeekend && <span className="ml-2 text-[#eab308]">Sprint weekend</span>}
                </p>
                <h2 id={titleId} className="mt-1 truncate text-lg font-semibold tracking-[-0.01em] text-white sm:text-2xl">
                  {race.name}
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                  {[race.circuit, race.country].filter(Boolean).join(", ") || "Circuit to be confirmed"}
                  {race.raceDate && ` · ${parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRace}
                aria-label="Close race detail"
                // 40px square: a real touch target, not a 16px glyph.
                className="-mr-1.5 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
                  <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 scrollbar-subtle sm:px-7">
              <RaceQuickViewBody season={season} race={race} drivers={drivers} />
            </div>

            <footer className="shrink-0 border-t border-white/[0.07] px-5 py-3 sm:px-7">
              <Link
                href={raceHref(season, race.round, race.name)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/[0.12] px-4 py-2.5 text-xs font-semibold text-neutral-200 transition hover:border-white/25 hover:bg-white/[0.04] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
              >
                View full race detail
                <span aria-hidden>→</span>
              </Link>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Body content, keyed off the weekend's real state. Each state shows only what is genuinely
 * knowable for it - no results for a race that hasn't run, no forecast for one that has.
 *
 * The layout is two columns on desktop (editorial and insight on the left, conditions and result
 * on the right) with the timeline and prediction review spanning the full width beneath, because
 * both of those are horizontal by nature. Everything collapses to one column below `lg`. */
function RaceQuickViewBody({ season, race, drivers }: { season: number; race: RaceSummary; drivers: DriverStandingRow[] }) {
  const review = buildPredictionReview(race);
  const insights = buildRaceInsights(race, drivers);
  const isOff = race.weekendStatus === "cancelled" || race.weekendStatus === "postponed";

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <StatusPill status={race.weekendStatus} />
      </div>

      <RaceMedia photoUrls={race.photoUrls} raceName={race.name} circuit={race.circuit} />

      {isOff ? (
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          This round is currently marked {STATUS_LABEL[race.weekendStatus].toLowerCase()}. The schedule below is the last published version; any replacement date will appear here once it is confirmed.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-2 lg:gap-10">
          <div className="flex min-w-0 flex-col gap-6">
            <RaceApexTake season={season} round={race.round} />
            {insights.length > 0 && <QuickInsights insights={insights} />}
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <RaceWeather race={race} />
            {race.weekendStatus === "completed" && <QuickResults race={race} />}
            {race.weekendStatus !== "completed" && <UpcomingFacts race={race} />}
          </div>
        </div>
      )}

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Weekend timeline</p>
        <div className="mt-4">
          <RaceTimeline sessions={race.sessions} />
        </div>
      </section>

      {review && <RacePredictionReview review={review} race={race} />}
    </div>
  );
}

/** Three short, computed observations. Not model output - see buildRaceInsights for why. */
function QuickInsights({ insights }: { insights: { text: string; tone: "neutral" | "positive" | "warning" }[] }) {
  const dot: Record<string, string> = {
    positive: "bg-emerald-400/70",
    warning: "bg-amber-400/70",
    neutral: "bg-neutral-500/70",
  };
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Quick insights</p>
      <ul className="mt-2.5 space-y-1.5">
        {insights.map((insight) => (
          <li key={insight.text} className="flex items-baseline gap-2.5 text-sm leading-relaxed text-neutral-300">
            <span aria-hidden className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${dot[insight.tone]}`} />
            <span className="min-w-0">{insight.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What is actually known about a round that hasn't run. Never a predicted result presented as
 * fact - the prediction review only ever appears after the event. */
function UpcomingFacts({ race }: { race: RaceSummary }) {
  const nextSession = race.sessions.find((s) => s.state === "current" || s.state === "upcoming");
  const completedSessions = race.sessions.filter((s) => s.state === "completed").length;

  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {race.weekendStatus === "live" ? "Weekend progress" : "Event"}
      </p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Format" value={race.isSprintWeekend ? "Sprint weekend" : "Conventional"} />
        <Fact label="Sessions" value={`${completedSessions} of ${race.sessions.length} run`} />
        {nextSession && <Fact label="Next session" value={nextSession.label} />}
        {race.circuit && <Fact label="Circuit" value={race.circuit} />}
      </dl>
      {race.predicted && race.predicted.winner && (
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
          {/* Explicitly framed as a projection, and only shown where no result exists to confuse
              it with. */}
          Apex&apos;s pre-race projection favours{" "}
          <span className="text-neutral-300">{race.predicted.winner}</span>. It is scored against the real result once the race runs.
        </p>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-neutral-200">{value}</dd>
    </div>
  );
}

/** Compact and hierarchical, not a results table - the full classification lives on the race
 * page, which the footer links to. The winner is deliberately several steps larger than anything
 * else here; a podium rendered as three equal rows buries the one fact people came for. */
function QuickResults({ race }: { race: RaceSummary }) {
  const rest = race.podium.filter((p) => p.position > 1);
  if (!race.winnerName && race.podium.length === 0) return null;

  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Result</p>

      {race.winnerName && (
        <div className="mt-2.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--f1-red)]">Winner</p>
          <p className="mt-0.5 truncate text-2xl font-semibold tracking-[-0.01em] text-white">{race.winnerName}</p>
        </div>
      )}

      {rest.length > 0 && (
        <ol className="mt-3 space-y-1">
          {rest.map((p) => (
            <li key={p.driver} className="flex items-baseline gap-2.5 text-sm">
              <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-neutral-600">P{p.position}</span>
              <span className="min-w-0 truncate text-neutral-300">{p.driverName}</span>
            </li>
          ))}
        </ol>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.055] pt-3">
        {race.poleSitterName && <Fact label="Pole" value={race.poleSitterName} />}
        {race.fastestLap && <Fact label="Fastest lap" value={race.fastestLap.driverName} />}
      </dl>
    </section>
  );
}

function StatusPill({ status }: { status: RaceWeekendStatus }) {
  const tone =
    status === "completed"
      ? "text-neutral-400 border-white/[0.12]"
      : status === "live"
        ? "text-[var(--f1-red)] border-[var(--f1-red)]/40"
        : status === "cancelled" || status === "postponed"
          ? "text-amber-400 border-amber-400/35"
          : "text-neutral-300 border-white/[0.16]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone}`}>
      {status === "live" && <span aria-hidden className="pulse-ring h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
