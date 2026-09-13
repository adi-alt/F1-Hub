"use client";

import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

/**
 * Registers the homepage's already-fetched intelligence as Apex's scope.
 *
 * This is what replaced ApexIntelligenceWidget's own private chat. The homepage used to be the one
 * place Apex existed, with its own floating pill and its own transcript; now it's one scope among
 * many and the single global launcher does the talking. The data is identical - the same
 * `useHomepageIntelligence()` every other homepage AI component reads - so answers here are no
 * less grounded than before, just reachable from a consistent place.
 *
 * Renders nothing.
 */
export function HomepageApexScope({ raceName, favoriteDriverName, favoriteTeamName }: { raceName?: string | null; favoriteDriverName?: string | null; favoriteTeamName?: string | null }) {
  const { intelligence } = useHomepageIntelligence();

  useRegisterApexScope({
    key: "homepage",
    label: "Your F1 overview",
    sublabel: raceName ?? undefined,
    // Only offered when the underlying fact actually exists - a "how's my driver doing" starter for
    // someone with no favourite set would be a question Apex has to decline.
    suggestions: [
      ...(raceName ? [`What should I watch at ${raceName}?`] : []),
      ...(favoriteDriverName ? [`How is ${favoriteDriverName} looking?`] : []),
      ...(favoriteTeamName ? [`How is ${favoriteTeamName} doing this season?`] : []),
      "What's the biggest risk this weekend?",
    ],
    // The whole briefing, exactly as the homepage's own components see it. The route caps and
    // sanitises it before it ever reaches a prompt.
    context: {
      page: "home",
      snapshot: (intelligence ?? {}) as unknown as Record<string, unknown>,
    },
  });

  return null;
}
