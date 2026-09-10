"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

const QUICK_JUMPS: { tab: string; question: string }[] = [
  { tab: "watch", question: "What should I watch this weekend?" },
  { tab: "yourRace", question: "How does this affect my driver?" },
  { tab: "risks", question: "What's the biggest risk?" },
];

/** The persistent, product-facing entry point into the Apex Intelligence workspace - never a
 * chatbot, never a second homepage. Reads the SAME single `useHomepageIntelligence()` context every
 * other AI component already reads - no new fetch, no polling, no independent request.
 *
 * Redesigned from a mini-panel that duplicated content already visible in the real workspace section
 * into a real quick-jump launcher: each "suggested question" is a genuine navigation action (set the
 * workspace's active tab, close this panel, scroll to it) against data that already exists - not a
 * fake conversational UI, per the explicit instruction not to build one.
 *
 * Collapsed pill stays a small "✦ Ask Apex" button by default and permanently once the user has
 * opened it once this session (hasOpenedOnce) - it only grows to announce something (loading/ready)
 * before that first open, so it never reads as a recurring SaaS notification, and never obscures
 * content given its small collapsed footprint. */
export function ApexIntelligenceWidget({
  raceName,
  onNavigateToTab,
}: {
  raceName?: string | null;
  onNavigateToTab: (tabKey: string) => void;
}) {
  const { intelligence, isLoading } = useHomepageIntelligence();
  const [expanded, setExpanded] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // A real, non-invented fact about this response - which of Apex Intelligence's own interpretation
  // fields are actually present for this visitor. Used only to decide whether to render the widget
  // at all (never displayed as a number).
  const hasAnyInsight = !!(
    intelligence?.raceBrief ||
    intelligence?.personalRaceBrief ||
    intelligence?.biggestUncertainty
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

  function jumpTo(tabKey: string) {
    close();
    onNavigateToTab(tabKey);
    const target = document.getElementById("intelligence-section");
    if (!target) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }

  if (isLoading === false && !hasAnyInsight) return null;

  const raceLabel = raceName || "race";
  // "Your Race" only makes sense as a suggestion when there's real personal content for it -
  // otherwise the workspace itself will already have excluded that tab (see
  // ApexIntelligenceWorkspace's own hasYourRace check).
  const hasYourRace = !!(intelligence?.personalRaceBrief || intelligence?.favoriteDriverInsight || intelligence?.favoriteTeamInsight || intelligence?.personalOutlook);
  const quickJumps = QUICK_JUMPS.filter((q) => q.tab !== "yourRace" || hasYourRace);

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
          className="glass-surface fixed bottom-4 right-4 z-[90] flex items-center gap-1.5 rounded-full px-3.5 py-2 text-left transition hover:brightness-110 sm:bottom-6 sm:right-6"
        >
          <span aria-hidden className="text-[var(--f1-red)]">✦</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">Ask Apex</span>
          {isLoading && !hasOpenedOnce && (
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
          )}
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          role="dialog"
          aria-modal="true"
          aria-label="Ask Apex"
          id="apex-intelligence-panel"
          className="glass-surface fixed inset-x-0 bottom-0 z-[100] max-h-[75vh] w-full overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-h-[80vh] sm:w-80 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                <span className="text-[var(--f1-red)]">✦</span> Ask Apex
              </p>
              {raceName && (
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">{raceName}</p>
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

          <div className="space-y-1 p-4">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">Jump to your {raceLabel} briefing</p>
            {quickJumps.map((q) => (
              <button
                key={q.tab}
                type="button"
                onClick={() => jumpTo(q.tab)}
                className="block w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-left text-sm text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
              >
                {q.question}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </>
  );
}
