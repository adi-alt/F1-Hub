"use client";

import { useEffect } from "react";

const MIN_GAP_MS = 60_000;

/** Records the end of a home visit, when the page is hidden or left - not when it renders, so a
 * refresh mid-visit keeps the same "since your last visit" window. The home's twin of the
 * communities' GroupVisitBeacon. Renders nothing. */
export function HomeVisitBeacon() {
  useEffect(() => {
    let lastSentAt = 0;
    const send = () => {
      const now = Date.now();
      if (now - lastSentAt < MIN_GAP_MS) return;
      lastSentAt = now;
      try {
        navigator.sendBeacon("/api/home/visit");
      } catch {
        // the window stays where it was: "since" over-reports a little, never loses anything
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") send();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
      send(); // client-side navigation away unmounts this without a pagehide
    };
  }, []);
  return null;
}
