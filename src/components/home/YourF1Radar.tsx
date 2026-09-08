"use client";

import type { ReactNode } from "react";
import { useHomepageIntelligence } from "./ai/HomepageIntelligenceProvider";
import type { FavoriteDriverCard, FavoriteTeamCard } from "@/lib/personalization";

/** A thin status rail, not a card or section - no title, no container border/background, no card
 * padding. Sits between RaceHero and YourF1 as a glance-length bridge, not a duplicate of YourF1's
 * own detail (form strip, trajectory chart) below it. Every value here is real, already-fetched
 * deterministic data - no invented trend arrows (no existing utility computes a genuine multi-race
 * trend, and manufacturing one would be new deterministic logic this pass doesn't add). Returns
 * null entirely if nothing real is available (a guest, or a signed-in user with no favorites/pick),
 * and each individual signal is itself omitted - never blanked with a placeholder - when its own
 * data is absent. The "F1 Hub Model disagrees" flag reads predictionChallenge.status from the
 * already-fetched intelligence context (not a new field, not a new request) - real, deterministic
 * agree/disagree logic decided by the route before the model ever ran. */
export function YourF1Radar({
  favoriteDriver,
  favoriteTeam,
  favoriteDriverRank,
  favoriteTeamRank,
  favoriteDriverCircuitWins,
}: {
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  favoriteDriverRank?: number | null;
  favoriteTeamRank?: number | null;
  favoriteDriverCircuitWins?: number | null;
}) {
  const { intelligence } = useHomepageIntelligence();
  const disagrees = intelligence?.predictionChallenge?.status === "DISAGREE";

  const items: ReactNode[] = [];

  if (favoriteDriver && favoriteDriverRank) {
    items.push(
      <span key="driver">
        <span className="font-semibold text-neutral-200">{favoriteDriver.name}</span>{" "}
        <span className="font-mono text-neutral-500">P{favoriteDriverRank} WDC</span>
      </span>,
    );
  }

  if (favoriteTeam && favoriteTeamRank) {
    items.push(
      <span key="team">
        <span className="font-semibold text-neutral-200">{favoriteTeam.name}</span>{" "}
        <span className="font-mono text-neutral-500">P{favoriteTeamRank} WCC</span>
      </span>,
    );
  }

  if (favoriteDriverCircuitWins != null && favoriteDriverCircuitWins > 0) {
    items.push(
      <span key="circuit" className="font-mono text-neutral-500">
        {favoriteDriverCircuitWins} win{favoriteDriverCircuitWins === 1 ? "" : "s"} here
      </span>,
    );
  }

  if (disagrees) {
    items.push(
      <span key="pick" className="font-semibold text-[var(--f1-red)]">
        ⚠ F1 Hub Model disagrees with your pick
      </span>,
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2 text-xs">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-x-2.5">
          {i > 0 && <span className="text-neutral-700" aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}
