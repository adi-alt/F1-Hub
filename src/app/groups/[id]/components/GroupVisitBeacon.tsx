"use client";

import { useEffect } from "react";

const MIN_GAP_MS = 60_000;

/** Records that this community was just seen, when the page is hidden or left - not when it renders.
 * The server reads "since your last visit" on every render (a realtime refresh renders again), so a
 * stamp written on render collapsed the window to "now" mid-visit. Leaving is the one moment that
 * ends a visit. sendBeacon survives the page closing; the minute-long gap stops tab-switching from
 * writing on every flip. Renders nothing. */
export function GroupVisitBeacon({ groupId }: { groupId: string }) {
  useEffect(() => {
    let lastSentAt = 0;
    const send = () => {
      const now = Date.now();
      if (now - lastSentAt < MIN_GAP_MS) return;
      lastSentAt = now;
      try {
        navigator.sendBeacon(`/api/groups/${groupId}/visit`);
      } catch {
        // the window just stays where it was: "since" over-reports a little, never loses anything
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
      send(); // client-side navigation to another page unmounts this without a pagehide
    };
  }, [groupId]);
  return null;
}
