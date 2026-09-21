"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { TOUR_STEPS, type TourStep } from "./tourSteps";

type TourContextValue = { start: () => void };
const TourContext = createContext<TourContextValue>({ start: () => {} });

/** "Replay F1 Hub tour" calls this. Safe to call from anywhere under the provider. */
export function useProductTour(): TourContextValue {
  return useContext(TourContext);
}

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6;
const CARD_W = 320;
const GAP = 12;
/** Where a resumed run picks up. Per-device on purpose: which step someone reached is a
 * convenience, not an account fact, and storing it server-side would mean a write per Next click. */
const STEP_KEY = "f1hub_tour_step";

export function ProductTourProvider({ children }: { children: React.ReactNode }) {
  const { user, onboardingDone, setOnboardingDone } = useAuth();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  const [running, setRunning] = useState(false);
  const [intro, setIntro] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const startedFor = useRef<string | null>(null);

  const onCommunities = pathname === "/groups";
  // A step whose target isn't on this page is dropped before the run starts, so Next/Back never
  // land on a dead step and the spotlight is never empty.
  const steps = useMemo(
    () =>
      // typeof document: this provider wraps the whole app, so it renders during SSR/prerender
      // too (including /_not-found). Touching the DOM in render there throws and fails the build.
      typeof document === "undefined"
        ? []
        : TOUR_STEPS.filter((s) => (s.scope === "global" || onCommunities) && document.querySelector(`[data-tour="${s.target}"]`) !== null),
    // Re-resolved whenever the route changes, since that's when the available targets change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onCommunities, pathname, running],
  );

  const step: TourStep | undefined = steps[index];

  const finish = useCallback(
    (outcome: "completed" | "skipped") => {
      setRunning(false);
      setIntro(false);
      setIndex(0);
      try {
        localStorage.removeItem(STEP_KEY);
      } catch {
        /* storage unavailable - the tour still ends, it just can't forget where it was */
      }
      setOnboardingDone(true);
      void fetch("/api/users/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      }).catch(() => {
        /* best effort - worst case it offers the tour again next visit */
      });
    },
    [setOnboardingDone],
  );

  const start = useCallback(() => {
    setIndex(0);
    setIntro(true);
    setRunning(true);
  }, []);

  // First run. Gated on a real answer (onboardingDone === false), never on `!onboardingDone`,
  // so the tour cannot flash while the session is still resolving. `startedFor` makes it once per
  // signed-in user per mount - route changes, refetches and remounts can't retrigger it.
  useEffect(() => {
    if (!user || onboardingDone !== false) return;
    if (startedFor.current === user.uid) return;
    startedFor.current = user.uid;
    let resumed = 0;
    try {
      resumed = Number(localStorage.getItem(STEP_KEY) ?? 0) || 0;
    } catch {
      resumed = 0;
    }
    setIndex(resumed);
    setIntro(resumed === 0);
    setRunning(true);
  }, [user, onboardingDone]);

  // Persist progress so a refresh or a closed browser resumes where it left off.
  useEffect(() => {
    if (!running || intro) return;
    try {
      localStorage.setItem(STEP_KEY, String(index));
    } catch {
      /* non-critical */
    }
  }, [running, intro, index]);

  // Track the target's real position. Measured on a frame loop rather than once: the target can
  // move for reasons this component never sees - an image loading above it, a column scrolling,
  // a widget resolving - and a spotlight that lags its target looks broken.
  useEffect(() => {
    if (!running || intro || !step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!(el instanceof HTMLElement)) return;

    // Bring it into view by scrolling its own nearest scrollable ancestor, not the whole page.
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest", inline: "nearest" });

    let frame = 0;
    const track = () => {
      const r = el.getBoundingClientRect();
      setRect((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [running, intro, step, reduceMotion]);

  // Escape ends the tour from anywhere, per the accessibility requirement.
  useEffect(() => {
    if (!running) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish("skipped");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [running, finish]);

  const value = useMemo(() => ({ start }), [start]);

  // Nothing to point at (every target missing) - end rather than show an empty spotlight. Given a
  // moment first, deliberately: a target can mount a tick after the tour starts (a feed still
  // resolving, a rail still fetching), and concluding "no targets" synchronously would end the
  // tour for a page that was merely a frame from being ready.
  const noTargets = running && !intro && steps.length === 0;
  useEffect(() => {
    if (!noTargets) return;
    const id = setTimeout(() => finish("completed"), 400);
    return () => clearTimeout(id);
  }, [noTargets, finish]);

  return (
    <TourContext value={value}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {running && intro && <IntroCard key="intro" onStart={() => setIntro(false)} onSkip={() => finish("skipped")} reduceMotion={!!reduceMotion} />}
            {running && !intro && step && rect && (
              <TourLayer
                key="tour"
                rect={rect}
                step={step}
                index={index}
                total={steps.length}
                reduceMotion={!!reduceMotion}
                onBack={() => setIndex((i) => Math.max(0, i - 1))}
                onNext={() => (index + 1 >= steps.length ? finish("completed") : setIndex((i) => i + 1))}
                onSkip={() => finish("skipped")}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </TourContext>
  );
}

function IntroCard({ onStart, onSkip, reduceMotion }: { onStart: () => void; onSkip: () => void; reduceMotion: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-intro-title"
    >
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        className="w-full max-w-sm rounded-xl border border-white/[0.09] bg-[var(--f1-carbon)]/85 p-5 shadow-2xl backdrop-blur-2xl"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--f1-red)]">Welcome to F1 Hub</p>
        <h2 id="tour-intro-title" className="mt-1.5 text-[18px] font-bold leading-snug text-white">
          Let&apos;s take a quick tour
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">About a minute, so you know where everything lives. You can stop at any point.</p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onStart}
            className="rounded-lg bg-[var(--f1-red)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
          >
            Take the tour
          </button>
          <button type="button" onClick={onSkip} className="rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-400 transition hover:text-white">
            Skip for now
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TourLayer({
  rect,
  step,
  index,
  total,
  reduceMotion,
  onBack,
  onNext,
  onSkip,
}: {
  rect: Rect;
  step: TourStep;
  index: number;
  total: number;
  reduceMotion: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const card = placeCard(rect);
  const last = index + 1 >= total;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="pointer-events-none fixed inset-0 z-[300]">
      {/* Four panels rather than one box-shadow ring: they dim everything EXCEPT the target while
          leaving the target itself genuinely untouched - no overlay tint on top of it, and no
          giant shadow that repaints the whole viewport every frame while tracking. */}
      <Scrim top={0} left={0} right={0} height={Math.max(0, rect.top - PAD)} />
      <Scrim top={Math.max(0, rect.top - PAD)} left={0} width={Math.max(0, rect.left - PAD)} height={rect.height + PAD * 2} />
      <Scrim top={Math.max(0, rect.top - PAD)} left={rect.left + rect.width + PAD} right={0} height={rect.height + PAD * 2} />
      <Scrim top={rect.top + rect.height + PAD} left={0} right={0} bottom={0} />

      <div
        aria-hidden
        className="absolute rounded-lg ring-2 ring-[var(--f1-red)]/70"
        style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
      />

      <motion.div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.16 }}
        style={card}
        className="pointer-events-auto absolute rounded-xl border border-white/[0.09] bg-[var(--f1-carbon)]/85 p-3.5 shadow-2xl backdrop-blur-2xl"
      >
        <h3 id="tour-step-title" className="text-[14px] font-semibold text-white">
          {step.title}
        </h3>
        <p id="tour-step-body" className="mt-1 text-[12.5px] leading-relaxed text-neutral-400">
          {step.body}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-neutral-500" aria-live="polite">
            {index + 1} / {total}
          </span>
          <button type="button" onClick={onSkip} className="text-[11.5px] font-medium text-neutral-500 transition hover:text-white">
            Skip tour
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {index > 0 && (
              <button type="button" onClick={onBack} className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-neutral-300 transition hover:bg-white/[0.06] hover:text-white">
                Back
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={onNext}
              className="rounded-lg bg-[var(--f1-red)] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
            >
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Scrim(props: { top?: number; left?: number; right?: number; bottom?: number; width?: number; height?: number }) {
  return <div aria-hidden className="absolute bg-black/60" style={props} />;
}

/**
 * Puts the card beside the target without covering it, and without leaving the viewport.
 *
 * Below is preferred, above is the fallback, and when neither side has room (a tall target, or a
 * phone) it goes wherever there is more space and is clamped to the viewport - which is what stops
 * the "tooltip off-screen" and "tooltip on top of the thing it describes" failures.
 */
function placeCard(rect: Rect): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const width = Math.min(CARD_W, vw - margin * 2);
  const estHeight = 150;

  const below = vh - (rect.top + rect.height) - GAP - margin;
  const above = rect.top - GAP - margin;
  const placeBelow = below >= estHeight || below >= above;

  const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), Math.max(margin, vw - width - margin));

  return placeBelow
    ? { top: rect.top + rect.height + GAP, left, width }
    : { top: Math.max(margin, rect.top - GAP - Math.min(estHeight, above)), left, width };
}
