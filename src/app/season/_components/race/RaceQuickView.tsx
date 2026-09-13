"use client";

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { raceHref } from "@/lib/routes";
import { parseUtcDateTime } from "@/lib/countdown";
import { useSeasonExplorer } from "../../_context/SeasonExplorerContext";
import { buildPredictionReview, type RaceSummary, type RaceWeekendStatus } from "../../_service/season.pure";
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
export function RaceQuickView({ season, raceSummaries }: { season: number; raceSummaries: RaceSummary[] }) {
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
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
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
            className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-xl border border-white/[0.1] bg-[rgba(20,20,23,0.92)] shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:max-h-[86vh] sm:max-w-[36rem] sm:rounded-lg"
          >
            {/* Phone-only drag affordance - the sheet reads as grabbable even though dismissal is
                the sticky close button and the backdrop. */}
            <div aria-hidden className="flex shrink-0 justify-center pt-2.5 sm:hidden">
              <span className="h-1 w-9 rounded-full bg-white/20" />
            </div>

            <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3.5 pt-3 sm:pt-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Round {race.round}
                  {race.isSprintWeekend && <span className="ml-2 text-[#eab308]">Sprint weekend</span>}
                </p>
                <h2 id={titleId} className="mt-1 truncate text-lg font-semibold tracking-[-0.01em] text-white">
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

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 scrollbar-subtle">
              <RaceQuickViewBody season={season} race={race} />
            </div>

            <footer className="shrink-0 border-t border-white/[0.07] px-5 py-3">
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
 * knowable for it — no results for a race that hasn't run, no forecast for one that has. */
function RaceQuickViewBody({ season, race }: { season: number; race: RaceSummary }) {
  const review = buildPredictionReview(race);
  const isOff = race.weekendStatus === "cancelled" || race.weekendStatus === "postponed";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <StatusPill status={race.weekendStatus} />
      </div>

      {race.photoUrls.length > 0 && <RaceMedia photoUrls={race.photoUrls} raceName={race.name} />}

      {isOff ? (
        <p className="text-sm leading-relaxed text-neutral-400">
          This round is currently marked {STATUS_LABEL[race.weekendStatus].toLowerCase()}. The schedule below is the last published version; any replacement date will appear here once it is confirmed.
        </p>
      ) : (
        <RaceApexTake season={season} round={race.round} />
      )}

      {race.weekendStatus === "completed" && <QuickResults race={race} />}

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Weekend schedule</p>
        <div className="mt-3">
          <RaceTimeline sessions={race.sessions} />
        </div>
      </section>

      <RaceWeather race={race} />

      {review && <RacePredictionReview review={review} />}
    </div>
  );
}

/** Compact, hierarchical, and not a results table — the full classification lives on the race
 * page, which the footer links to. */
function QuickResults({ race }: { race: RaceSummary }) {
  const rest = race.podium.filter((p) => p.position > 1);
  if (!race.winnerName && race.podium.length === 0) return null;

  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Result</p>

      {race.winnerName && (
        <div className="mt-2.5 flex items-baseline gap-2.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--f1-red)]">Won</span>
          <span className="truncate text-lg font-semibold text-white">{race.winnerName}</span>
        </div>
      )}

      {rest.length > 0 && (
        <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {rest.map((p) => (
            <li key={p.driver} className="flex items-baseline gap-1.5 text-sm">
              <span className="font-mono text-[11px] tabular-nums text-neutral-600">P{p.position}</span>
              <span className="text-neutral-300">{p.driverName}</span>
            </li>
          ))}
        </ol>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {race.poleSitterName && (
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Pole</dt>
            <dd className="mt-0.5 truncate text-sm text-neutral-300">{race.poleSitterName}</dd>
          </div>
        )}
        {race.fastestLap && (
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Fastest lap</dt>
            <dd className="mt-0.5 truncate text-sm text-neutral-300">{race.fastestLap.driverName}</dd>
          </div>
        )}
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
