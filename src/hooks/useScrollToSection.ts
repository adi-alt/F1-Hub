"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Deep-link support for the old tab architecture's `?tab=` param - now that every former "tab" is
 * an always-visible page section instead of a switched view, "open this tab" becomes "scroll to
 * this section" (`id={key}` on the section itself). Keeps `raceHref(..., "simulation")` and the
 * `/races/simulation` redirect shim meaningful without reintroducing a tab shell. */
export function useScrollToSection() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const key = searchParams.get("tab");
    if (!key) return;
    document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchParams]);
}
