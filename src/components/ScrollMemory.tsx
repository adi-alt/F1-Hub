"use client";

import { useEffect } from "react";

const STORAGE_KEY = "apex:scroll";
const MAX_REMEMBERED = 60;
const GIVE_UP_MS = 3000;
const SETTLE_MS = 900;

type Remembered = Record<string, number>;

function read(): Remembered {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Remembered;
  } catch {
    return {};
  }
}

function write(remembered: Remembered) {
  try {
    // Oldest first: JS keeps insertion order, and a re-saved key moves to the end (delete, then set).
    const keys = Object.keys(remembered);
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED))) delete remembered[key];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(remembered));
  } catch {
    // storage is blocked or full: Back simply lands at the top, as it did before
  }
}

const currentKey = () => window.location.pathname + window.location.search;

// While a restore is running, scroll events are not saved: Next moves the page itself after a Back (to the
// top of the new page's first element, twice: once for the loading screen, once for the content), and
// saving those would overwrite the very position being restored.
let restoring = false;

/** Scrolls to `target` once the page is tall enough to reach it, then keeps it there for a moment.
 * A page that streams in (a loading skeleton first, the real content after) is short at first, and the
 * browser's own one-shot restoration clamped to that height and never tried again; Next also scrolls the
 * page itself as each part arrives. Stops at once if the person scrolls or presses a key. */
function restoreWhenTallEnough(target: number) {
  const start = performance.now();
  let reachedAt = 0;
  restoring = true;
  const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  let stopped = false;
  const stop = () => {
    stopped = true;
    restoring = false;
    for (const name of events) window.removeEventListener(name, stop);
  };
  for (const name of events) window.addEventListener(name, stop, { passive: true });

  const tick = () => {
    if (stopped) return;
    const now = performance.now();
    const reachable = document.documentElement.scrollHeight - window.innerHeight;
    if (reachable >= target - 1) {
      if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target);
      if (!reachedAt) reachedAt = now;
      if (now - reachedAt > SETTLE_MS) return stop();
    } else if (now - start > GIVE_UP_MS) {
      window.scrollTo(0, Math.max(0, reachable));
      return stop();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Back and Forward return to where you were on the page (audit R-31, DS-04). The document scrolls, so
 * the browser could do this itself, but only if the page is already full height when it tries, which a
 * page that streams in behind a loading screen is not. This remembers each URL's scroll position for
 * the tab and puts it back once the page can reach it. A link click is not a traversal: Next scrolls
 * that to the top, and nothing here touches it. Renders nothing.
 */
export function ScrollMemory() {
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const remember = () => {
      if (restoring) return;
      const remembered = read();
      const key = currentKey();
      delete remembered[key];
      remembered[key] = Math.round(window.scrollY);
      write(remembered);
    };

    // A position is remembered only when the person put it there. Swapping the page's content on a
    // navigation makes the browser clamp the scroll to the new, shorter page BEFORE the address bar
    // changes, so saving every scroll event stored that clamp under the page being left: Back then
    // restored a position the person never scrolled to.
    let lastInputAt = 0;
    const noteInput = () => {
      lastInputAt = performance.now();
    };
    let frame = 0;
    // After a click the page may be swapped out and clamped within the next moments (see above); those
    // scroll events are the page changing, not the person scrolling.
    let ignoreScrollUntil = 0;
    const onScroll = () => {
      const now = performance.now();
      if (now < ignoreScrollUntil || now - lastInputAt > 400 || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        remember();
      });
    };
    // The moment before any click can navigate: the real position of the page being left.
    const onClick = () => {
      remember();
      ignoreScrollUntil = performance.now() + 1000;
    };
    const inputs = ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"] as const;

    // popstate is Back, Forward or a hash change, and fires after the address bar already shows the
    // new URL, so currentKey() is the page we are arriving at.
    const onPopState = () => {
      const target = read()[currentKey()];
      if (target && target > 0) restoreWhenTallEnough(target);
    };

    for (const name of inputs) window.addEventListener(name, noteInput, { passive: true, capture: true });
    // Dragging the scrollbar is a pointer move with a button held.
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons > 0) noteInput();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", remember);
    window.addEventListener("popstate", onPopState);

    // A reload, or Back from another site, arrives without a popstate: the same restoration applies.
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation && (navigation.type === "reload" || navigation.type === "back_forward")) {
      const target = read()[currentKey()];
      if (target && target > 0) restoreWhenTallEnough(target);
    }

    return () => {
      for (const name of inputs) window.removeEventListener(name, noteInput, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", remember);
      window.removeEventListener("popstate", onPopState);
      if (frame) cancelAnimationFrame(frame);
      window.history.scrollRestoration = previous;
    };
  }, []);

  return null;
}
