"use client";

import { useCallback, useEffect, useRef } from "react";
import Lenis, { type LenisOptions } from "lenis";

/**
 * Ported from Nexus-Internal-Platform's `useLenisContainer` (src/app/hooks/useLenis.ts) — the
 * f1-hub Lenis setup this replaced mounted one document-level instance in the root layout with
 * no init delay, no empty-content guard, and no re-init on client-side navigation, which is
 * exactly the recipe for a "stuck" scroll once real content replaces the initial empty page.
 * Nexus never uses a document-level instance at all; every scrollable region (sidebars, tables,
 * modals) gets its own scoped instance bound to its own container, created only once that
 * container actually has content.
 *
 * f1-hub has no such nested-scroll regions today (single-scroll pages, no dashboard panels) —
 * this is kept faithful to the original for if that ever changes, but the layout uses
 * `useLenisPage` below instead, which applies the same fixes at the window/document level rather
 * than forcing a custom scrollable wrapper (that would fight `position: sticky` on the header).
 */
export function useLenisContainer(
  container?: HTMLElement | null,
  options?: LenisOptions,
  dependencyKey?: unknown,
) {
  const lenisRef = useRef<Lenis | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initializeWithDelay() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled) return;
      if (!container) return;
      if (!(container instanceof HTMLElement)) return;
      if (container.children.length === 0) return;

      const content = (container.querySelector(":scope > *") ?? container.firstElementChild ?? container) as HTMLElement;

      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

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

/**
 * Window/document-level equivalent, for a normal single-scroll page rather than a nested
 * scrollable region — same hardening as useLenisContainer above (delayed init, raf loop that
 * self-terminates on destroy, full teardown on unmount), plus re-init on `dependencyKey` change
 * (pass the pathname) so client-side navigation doesn't reuse a stale scroll-height measurement
 * from whatever page was open before. No `wrapper`/`content` override — Lenis defaults to
 * `window`/`document.documentElement`, which is what lets `position: sticky` in the header keep
 * working exactly as it does with native scroll.
 */
export function useLenisPage(options?: LenisOptions, dependencyKey?: unknown) {
  const lenisRef = useRef<Lenis | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initializeWithDelay() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled) return;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

      try {
        const lenis = new Lenis({
          duration: options?.duration ?? 1.0,
          easing: options?.easing ?? ((t: number) => 1 - Math.pow(1 - t, 1.5)),
          wheelMultiplier: options?.wheelMultiplier ?? 0.8,
          touchMultiplier: options?.touchMultiplier ?? 1.2,
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
        console.error("useLenisPage: failed to initialize", error);
      }
    }

    void initializeWithDelay();

    return () => {
      cancelled = true;
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
  }, [dependencyKey]);
}
