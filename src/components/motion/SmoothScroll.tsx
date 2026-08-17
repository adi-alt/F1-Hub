"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Footer } from "@/components/Footer";
import { useLenisContainer } from "./useLenisContainer";

/**
 * The app's root scroll region — mounted once in the root layout around `<main>`, with the
 * header sitting outside it as a non-scrolling flex sibling. Uses a state setter as the ref
 * (not a plain useRef) so the DOM node reaching `useLenisContainer` triggers a real re-render the
 * moment it attaches, rather than depending on some unrelated re-render to pick up the change —
 * Nexus's own call sites get away with `ref.current` because those pages happen to re-render
 * often anyway (live timers, polling); this page doesn't have that, so it needs its own trigger.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const pathname = usePathname();
  useLenisContainer(container, undefined, pathname);

  // Next.js's built-in "scroll to top on navigation" only touches window scroll — since this
  // container owns scroll instead, it has to reset itself on every route change.
  useEffect(() => {
    container?.scrollTo({ top: 0 });
  }, [pathname, container]);

  return (
    <div ref={setContainer} className="flex-1 overflow-y-auto">
      {/* One wrapper, not two siblings — Lenis measures its `content` node's height as the
          scroll limit, and this hook resolves that to the container's first child, so the
          footer has to live inside the same node as `main` or its height falls outside what
          Lenis thinks is scrollable. */}
      <div className="flex min-h-full flex-col">
        <main className="flex-1">{children}</main>
        {pathname === "/" && <Footer />}
      </div>
    </div>
  );
}
