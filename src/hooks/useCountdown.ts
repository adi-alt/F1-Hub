import { useEffect, useState } from "react";

/** Seconds remaining until `targetTimestamp`, ticking once a second — only while a component
 * actually renders it (the interval is cleaned up on unmount, e.g. when the OTP step in
 * AuthDialog isn't showing). Returns 0 once the target has passed, never negative. */
export function useCountdown(targetTimestamp: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return Math.max(0, Math.ceil((targetTimestamp - now) / 1000));
}
