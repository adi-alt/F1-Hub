"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useAuth } from "@/providers/AuthProvider";
import { TOUR_STEPS, type TourStep } from "./tourSteps";
import { useAppLocation } from "@/hooks/useAppLocation";

type TourContextValue = { start: () => void };
const TourContext = createContext<TourContextValue>({ start: () => {} });

/** "Replay Apex F1 Hub tour" calls this. Safe to call from anywhere under the provider. */
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
  const { appPath, params, key: pathname } = useAppLocation();
  const reduceMotion = useReducedMotion();

  const [running, setRunning] = useState(false);
  const [intro, setIntro] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const startedFor = useRef<string | null>(null);

  const onCommunities = appPath === "/communities" && !params?.get("id");
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

  // Escape ends the tour from anywhere, per the accessibility requirement. The intro is a Dialog,
  // whose own Escape handling skips it.
  useEffect(() => {
    if (!running || intro) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish("skipped");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [running, intro, finish]);

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
      <IntroDialog open={running && intro} onStart={() => setIntro(false)} onSkip={() => finish("skipped")} />
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
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

/** The opening card, in the house Dialog: focus trap, Escape (skips) and focus return. */
function IntroDialog({ open, onStart, onSkip }: { open: boolean; onStart: () => void; onSkip: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onSkip}
      size="sm"
      title="Let's take a quick tour"
      description="About a minute, so you know where everything lives. You can stop at any point."
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onSkip}>
            Skip for now
          </Button>
          <Button variant="primary" size="md" onClick={onStart}>
            Take the tour
          </Button>
        </>
      }
    />
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
        className="absolute rounded-card ring-2 ring-focus-ring"
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
        className="pointer-events-auto absolute rounded-overlay surface-glass p-4 shadow-overlay"
      >
        <h3 id="tour-step-title" className="text-title-md text-primary">
          {step.title}
        </h3>
        <p id="tour-step-body" className="mt-1 text-body-sm text-secondary">
          {step.body}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-caption tabular-nums text-tertiary" aria-live="polite">
            {index + 1} / {total}
          </span>
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip tour
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {index > 0 && (
              <Button variant="secondary" size="sm" onClick={onBack}>
                Back
              </Button>
            )}
            <Button variant="primary" size="sm" autoFocus onClick={onNext}>
              {last ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Scrim(props: { top?: number; left?: number; right?: number; bottom?: number; width?: number; height?: number }) {
  return <div aria-hidden className="absolute bg-surface-0/60" style={props} />;
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
