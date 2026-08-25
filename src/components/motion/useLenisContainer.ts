"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Lenis, { type LenisOptions } from "lenis";
import { isRegisteredNestedLenisRegion, registerNestedLenisRegion } from "./nestedLenisRegistry";

type NestedScrollOptions = {
  // Set on the page's own root instance (SmoothScroll.tsx): defers to whichever *specific*
  // nested region a wheel event lands in, rather than `allowNestedScroll`'s own heuristic (a
  // real DOM-overflow check that in practice didn't reliably catch this app's own nested tables)
  // or `data-lenis-prevent` (which every instance treats as "never smooth-scroll here", so it
  // can't distinguish "the root should ignore this" from "but a nested instance still should").
  deferToNestedRegions?: boolean;
  // Set on a *nested* instance (a table's own scroll wrapper, say): registers this container so
  // deferToNestedRegions callers give way to it.
  registerAsNestedRegion?: boolean;
};

/**
 * Ported from Nexus-Internal-Platform's `useLenisContainer` (src/app/hooks/useLenis.ts). Nexus
 * never runs Lenis in document/window mode anywhere in its codebase — every single call site
 * (dashboard panels, sidebars, tables, modals) binds a scoped instance to a real wrapper element.
 * That's deliberate, not incidental: Lenis's window-mode dimension tracking is the less reliable
 * path, which is exactly what f1-hub's previous document-level instance ran into (scroll working
 * for a while, then going stuck). The fix is to always give it a real wrapper, here applied to
 * the app's own root scroll region in `SmoothScroll.tsx` instead of a nested panel.
 */
export function useLenisContainer(
  container?: HTMLElement | null,
  options?: LenisOptions,
  dependencyKey?: unknown,
  nestedScrollOptions?: NestedScrollOptions,
) {
  const lenisRef = useRef<Lenis | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | null = null;

    async function initializeWithDelay() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled) return;
      if (!container) return;
      if (!(container instanceof HTMLElement)) return;
      if (container.children.length === 0) return;

      const content = (container.querySelector(":scope > *") ?? container.firstElementChild ?? container) as HTMLElement;

      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

      if (nestedScrollOptions?.registerAsNestedRegion) {
        unregister = registerNestedLenisRegion(container);
      }

      try {
        const lenis = new Lenis({
          wrapper: container,
          content,
          duration: options?.duration ?? 1.0,
          easing: options?.easing ?? ((t: number) => 1 - Math.pow(1 - t, 1.5)),
          wheelMultiplier: options?.wheelMultiplier ?? 0.8,
          touchMultiplier: options?.touchMultiplier ?? 1.2,
          orientation: options?.orientation ?? "vertical",
          gestureOrientation: options?.gestureOrientation ?? "vertical",
          // Without this, Lenis hijacks every wheel event on its wrapper for its own smooth-scroll
          // simulation, including ones happening over a nested `overflow-y-auto` region (the
          // archive/personalization card grids and tables) — the nested element structurally can
          // scroll (confirmed: scrollHeight > clientHeight) but never visibly does, since the
          // wheel event never reaches its native scroll handling. This makes Lenis check for a
          // scrollable ancestor under the cursor first and defer to it natively when found.
          allowNestedScroll: options?.allowNestedScroll ?? true,
          // `node !== container` matters: without excluding its own wrapper, a
          // registerAsNestedRegion instance would see *itself* in the registry and defer to
          // itself on every event, i.e. never actually scroll.
          prevent: nestedScrollOptions?.deferToNestedRegions
            ? (node) => node !== container && isRegisteredNestedLenisRegion(node)
            : options?.prevent,
        });
        lenisRef.current = lenis;

        function raf(time: number) {
          if (lenisRef.current) {
            lenis.raf(time);
            rafIdRef.current = requestAnimationFrame(raf);
          }
        }
        rafIdRef.current = requestAnimationFrame(raf);
      } catch (error) {
        console.error("useLenisContainer: failed to initialize", error);
      }
    }

    void initializeWithDelay();

    return () => {
      cancelled = true;
      unregister?.();
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (lenisRef.current) {
        lenisRef.current.destroy();
        lenisRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, dependencyKey]);

  const scrollTo = useCallback((target: string | number, scrollOptions?: Parameters<Lenis["scrollTo"]>[1]) => {
    lenisRef.current?.scrollTo(target, scrollOptions);
  }, []);

  return { scrollTo };
}

/** The common case for a self-contained scroll region (a table, a card grid) that wants its own
 * Lenis-smoothed scroll without fighting the page's root instance — bundles the ref-callback
 * state and the `registerAsNestedRegion` wiring `useLenisContainer` needs, so a call site is just
 * `<div ref={useNestedLenisScroll()}>`. `options` is for the rare case that isn't a plain vertical
 * region (the calendar heatmap's horizontal strip passes `{ orientation: "horizontal",
 * gestureOrientation: "horizontal" }`). */
export function useNestedLenisScroll(dependencyKey?: unknown, options?: LenisOptions) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useLenisContainer(container, options, dependencyKey, { registerAsNestedRegion: true });
  return setContainer;
}
