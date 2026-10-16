"use client";

// Adapted from Bklit UI (MIT, see LICENSE.md): the ring chart's enter timing.

import { animate, type MotionValue, type Transition, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** The default enter transition: a long ease-in-out, so a ring draws rather than snaps. */
export const DEFAULT_CHART_ENTER_TRANSITION: Transition = {
  type: "tween",
  duration: 1.1,
  ease: [0.85, 0, 0.15, 1],
};

/** Drives a 0→1 enter progress with `enterTransition`, after `delaySeconds`; `replayKey` restarts it. */
export function useMountProgress(enterTransition: Transition | undefined, delaySeconds: number, replayKey: number | string) {
  const progress = useMotionValue(0);
  // The latest transition, read when the animation starts (kept current outside render).
  const transitionRef = useRef(enterTransition);
  useEffect(() => {
    transitionRef.current = enterTransition;
  }, [enterTransition]);

  useEffect(() => {
    progress.set(0);
    const controls = animate(progress, 1, { ...(transitionRef.current ?? DEFAULT_CHART_ENTER_TRANSITION), delay: delaySeconds });
    return () => controls.stop();
  }, [delaySeconds, replayKey, progress]);

  return progress;
}

/** True once a mount progress reaches 1: lets the ring swap animated paths for static ones after it has drawn. */
export function useEnterComplete(mountProgress: MotionValue<number>): boolean {
  const [complete, setComplete] = useState(() => mountProgress.get() >= 1);
  // Already complete at mount is covered by the initial state; after that, follow the value.
  useEffect(
    () =>
      mountProgress.on("change", (value) => {
        if (value >= 1) setComplete(true);
      }),
    [mountProgress],
  );
  return complete;
}
