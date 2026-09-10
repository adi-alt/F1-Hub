"use client";

import type { ReactNode } from "react";
import { useHomepageIntelligence } from "./ai/HomepageIntelligenceProvider";
import type { FavoriteDriverCard, FavoriteTeamCard } from "@/lib/personalization";

function scrollToYourF1() {
  const target = document.getElementById("your-f1-section");
  if (!target) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
}

/** A thin status rail, not a card or section - no title, no container border/background, no card
 * padding. Sits between RaceHero and YourF1 as a glance-length bridge, reading as one connected
 * hero/cockpit block rather than two separate sections. Every value here is real, already-fetched
 * deterministic data - no invented trend arrows. Returns null entirely if nothing real is available
 * (a guest, or a signed-in user with no favorites/pick), and each individual signal is itself
 * omitted - never blanked with a placeholder - when its own data is absent.
 *
 * Clickable, not just informational: driver/team/predictions each jump to Your F1 with a specific
 * tab active, matching where that content actually lives (driver -> Championship, since the
 * trajectory chart is driver-series-focused; team and predictions -> Overview, where team standing
 * and prediction count are shown). */
export function YourF1Radar({
  favoriteDriver,
  favoriteTeam,
  favoriteDriverRank,
  favoriteTeamRank,
  favoriteDriverCircuitWins,
  favoriteDriverPoints,
  favoriteDriverGapToLeader,
  predictionCount,
  onNavigate,
}: {
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  favoriteDriverRank?: number | null;
  favoriteTeamRank?: number | null;
  favoriteDriverCircuitWins?: number | null;
  favoriteDriverPoints?: number | null;
  favoriteDriverGapToLeader?: number | null;
  predictionCount?: number;
  onNavigate: (tab: string) => void;
}) {
  const { intelligence } = useHomepageIntelligence();
  const disagrees = intelligence?.predictionChallenge?.status === "DISAGREE";

  function go(tab: string) {
    onNavigate(tab);
    scrollToYourF1();
  }

  const items: ReactNode[] = [];

  if (favoriteDriver && favoriteDriverRank) {
    items.push(
      <button key="driver" type="button" onClick={() => go("championship")} className="transition hover:text-white">
        <span className="font-semibold text-neutral-200">{favoriteDriver.name}</span>{" "}
        <span className="font-mono text-neutral-500">P{favoriteDriverRank} WDC</span>
        {favoriteDriverPoints != null && <span className="font-mono text-neutral-500"> · {favoriteDriverPoints} pts</span>}
        {favoriteDriverGapToLeader != null && favoriteDriverGapToLeader > 0 && (
          <span className="font-mono text-neutral-500"> · {favoriteDriverGapToLeader} to leader</span>
        )}
      </button>,
    );
  }

  if (favoriteTeam && favoriteTeamRank) {
    items.push(
      <button key="team" type="button" onClick={() => go("overview")} className="transition hover:text-white">
        <span className="font-semibold text-neutral-200">{favoriteTeam.name}</span>{" "}
        <span className="font-mono text-neutral-500">P{favoriteTeamRank} WCC</span>
      </button>,
    );
  }

  if (favoriteDriverCircuitWins != null && favoriteDriverCircuitWins > 0) {
    items.push(
      <span key="circuit" className="font-mono text-neutral-500">
        {favoriteDriverCircuitWins} win{favoriteDriverCircuitWins === 1 ? "" : "s"} here
      </span>,
    );
  }

  if (predictionCount != null) {
    items.push(
      <button key="predictions" type="button" onClick={() => go("overview")} className="font-mono text-neutral-500 transition hover:text-white">
        {predictionCount} prediction{predictionCount === 1 ? "" : "s"}
      </button>,
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
    // -mt-6 pulls this up against RaceHero above it (both sit inside HomeLayout's uniform
    // space-y-9 gap otherwise) so the hero + status rail read as one connected block, per the
    // redesign's "hero and radar act as one connected unit" direction - a contained, local
    // override rather than changing HomeLayout's shared spacing for every section.
    <div className="-mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2 text-xs">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-x-2.5">
          {i > 0 && <span className="text-neutral-700" aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}
