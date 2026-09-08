"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { modelPositionFor } from "../PickVsModel";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";
import type { RaceDoc, UserPick } from "@/lib/types/race";

/** The persistent, product-facing entry point into the existing intelligence section - never a
 * chatbot, never a second homepage. Reads the SAME single `useHomepageIntelligence()` context every
 * other AI component already reads - no new fetch, no polling, no independent request. Mounted
 * inside both PersonalHome and PublicHome (inside their own HomepageIntelligenceProvider), never as
 * a page-level sibling - that placement would sit outside the context tree entirely.
 *
 * Collapsed pill stays a bare "✦ APEX INTELLIGENCE" by default and permanently once the user has
 * opened it once this session (hasOpenedOnce) - it only grows to announce something (loading/ready)
 * before that first open, so it never reads as a recurring SaaS notification. No numeric insight
 * count is ever shown - a count of which AI fields are present was considered and dropped in favor
 * of race-name-personalized copy; a number invites exactly the "is this AI-generated?" question
 * this whole naming pass is trying to avoid. */
export function ApexIntelligenceWidget({
  raceName,
  round,
  myPick,
  nextRace,
}: {
  raceName?: string | null;
  round?: number | null;
  myPick: UserPick | null;
  nextRace: RaceDoc | null;
}) {
  const { intelligence, isLoading } = useHomepageIntelligence();
  const [expanded, setExpanded] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // A real, non-invented fact about this response - which of Apex Intelligence's own interpretation
  // fields are actually present for this visitor. Used only to decide whether to render the widget
  // at all (never displayed as a number - these are AI interpretation output, not F1 Hub Model
  // deterministic data, and the schema/fallback both always populate biggestUncertainty regardless
  // of personalization, so in practice this is almost always >= 1 even for a guest).
  const hasAnyInsight = !!(
    intelligence?.personalRaceBrief ||
    intelligence?.biggestUncertainty ||
    (intelligence?.predictionChallenge && intelligence.predictionChallenge.status !== "NO_PICK")
  );

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    if (expanded) closeButtonRef.current?.focus();
  }, [expanded]);

  function open() {
    setExpanded(true);
  }

  function close() {
    setExpanded(false);
    setHasOpenedOnce(true);
  }

  function openFullIntelligence() {
    close();
    const target = document.getElementById("intelligence-section");
    if (!target) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }

  if (isLoading === false && !hasAnyInsight) return null;

  const raceLabel = raceName || "race";
  const challenge = intelligence?.predictionChallenge;
  const showChallenge = challenge && challenge.status !== "NO_PICK";
  const yourWinner = myPick?.predictedPodium?.[0] ?? null;
  const modelPosition = yourWinner && nextRace ? modelPositionFor(nextRace, yourWinner) : null;

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-[95] bg-black/35 sm:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {!expanded ? (
        <button
          type="button"
          onClick={open}
          aria-expanded={expanded}
          aria-controls="apex-intelligence-panel"
          className="glass-surface fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-2xl px-4 py-2.5 text-left transition hover:brightness-110 sm:bottom-6 sm:right-6"
        >
          <span aria-hidden className="text-[var(--f1-red)]">✦</span>
          <span className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
              Apex Intelligence
            </span>
            {isLoading && !hasOpenedOnce && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
                Analyzing your race
                <span className="flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1 w-1 rounded-full bg-[var(--f1-red)]"
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                    />
                  ))}
                </span>
              </span>
            )}
            {!isLoading && !hasOpenedOnce && hasAnyInsight && (
              <span className="mt-0.5 text-[11px] text-neutral-400">
                Your {raceLabel} briefing is ready — <span className="text-[var(--f1-red)]">View briefing →</span>
              </span>
            )}
          </span>
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          role="dialog"
          aria-modal="true"
          aria-label="Apex Intelligence briefing"
          id="apex-intelligence-panel"
          className="glass-surface fixed inset-x-0 bottom-0 z-[100] max-h-[75vh] w-full overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-h-[80vh] sm:w-80 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                <span className="text-[var(--f1-red)]">✦</span> Apex Intelligence
              </p>
              {raceName && (
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                  {raceName}{round ? ` · Round ${round}` : ""}
                </p>
              )}
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-full p-1 text-neutral-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="space-y-4 p-4">
            {intelligence?.personalRaceBrief && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--f1-red)]">Your Race</p>
                <p className="mt-1 text-sm font-medium leading-snug text-white">{intelligence.personalRaceBrief.headline}</p>
              </div>
            )}

            {intelligence?.biggestUncertainty && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">What You Might Be Missing</p>
                <p className="mt-1 text-sm leading-snug text-neutral-200">{intelligence.biggestUncertainty.title}</p>
              </div>
            )}

            {showChallenge && yourWinner && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">AI vs You</p>
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">Your Pick</p>
                    <p className="font-semibold text-white">{yourWinner} P1</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-neutral-600">vs</span>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">F1 Hub Model</p>
                    <p className="font-semibold text-white">
                      {yourWinner} {modelPosition != null ? `P${modelPosition}` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={openFullIntelligence}
              className="w-full rounded-full bg-[var(--f1-red)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Open full intelligence →
            </button>
          </div>
        </motion.div>
      )}
    </>
  );
}
