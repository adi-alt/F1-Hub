"use client";

import { usePathname } from "next/navigation";
import { useLenisPage } from "./useLenisContainer";

/** Mounted once in the root layout. Re-initializes on pathname change (see useLenisPage) —
 * that re-init, plus the delayed-init/guarded-cleanup hardening ported from Nexus, is what fixes
 * the "stuck after navigating" bug the previous naive `new Lenis()` + bare raf loop had. No
 * visual output; just drives Lenis's requestAnimationFrame loop. */
export function SmoothScroll() {
  const pathname = usePathname();
  useLenisPage(undefined, pathname);
  return null;
}
