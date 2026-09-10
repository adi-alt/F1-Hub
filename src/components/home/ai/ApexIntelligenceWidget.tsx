"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

const QUICK_JUMPS: { tab: string; question: string }[] = [
  { tab: "watch", question: "What should I watch this weekend?" },
  { tab: "yourRace", question: "How does this affect my driver?" },
  { tab: "risks", question: "What's the biggest risk?" },
];

type ChatMessage = { role: "user" | "assistant"; content: string };

const CAPACITY_FALLBACK_TEXT = "Apex is at capacity right now - try again in a moment.";
const NETWORK_FALLBACK_TEXT = "Couldn't reach Apex just now - check your connection and try again.";

/** The persistent, product-facing entry point into the Apex Intelligence workspace, AND (new) a
 * real single-turn conversational Q&A surface - never a fake chat, per the explicit instruction:
 * every message actually round-trips to `/api/ai/ask-apex`, grounded in the same
 * `useHomepageIntelligence()` data every other AI component reads.
 *
 * The 3 quick-jump buttons are kept (still useful, zero-latency navigation against data that
 * already exists) but demote to a small secondary row once a real conversation starts, so the
 * transcript - not the buttons - is unambiguously the primary interaction.
 *
 * Collapsed pill stays a small "✦ Ask Apex" button by default and permanently once the user has
 * opened it once this session (hasOpenedOnce) - it only grows to announce something (loading/ready)
 * before that first open, so it never reads as a recurring SaaS notification, and never obscures
 * content given its small collapsed footprint. */
export function ApexIntelligenceWidget({
  raceName,
  favoriteDriverName,
  favoriteTeamName,
  onNavigateToTab,
}: {
  raceName?: string | null;
  favoriteDriverName?: string | null;
  favoriteTeamName?: string | null;
  onNavigateToTab: (tabKey: string) => void;
}) {
  const { intelligence, isLoading } = useHomepageIntelligence();
  const [expanded, setExpanded] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationFavoriteKey, setConversationFavoriteKey] = useState("");
  const [favoriteKeyChanged, setFavoriteKeyChanged] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

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
    if (!expanded) return;
    // Focus the input once a conversation exists (there's something to type into right away);
    // otherwise focus the close button, matching the previous quick-jump-only behavior.
    if (messages.length > 0) inputRef.current?.focus();
    else closeButtonRef.current?.focus();
    // Only on open/first message, not on every keystroke - eslint-disable would be overkill here,
    // `expanded` is the real trigger this effect cares about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages, isSending]);

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

  function startNewConversation() {
    setMessages([]);
    setConversationFavoriteKey("");
    setFavoriteKeyChanged(false);
  }

  async function sendMessage(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isSending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsSending(true);
    try {
      const res = await fetch("/api/ai/ask-apex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          // Last few turns only - the server re-caps/re-sanitizes this regardless, but no reason
          // to send an ever-growing transcript.
          history: messages.slice(-6),
          intelligenceSnapshot: intelligence,
          conversationFavoriteKey,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer || CAPACITY_FALLBACK_TEXT }]);
      if (typeof data.favoriteKey === "string") setConversationFavoriteKey(data.favoriteKey);
      setFavoriteKeyChanged(!!data.favoriteKeyChanged);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: NETWORK_FALLBACK_TEXT }]);
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading === false && !hasAnyInsight) return null;

  const raceLabel = raceName || "race";
  // "Your Race" only makes sense as a suggestion when there's real personal content for it -
  // otherwise the workspace itself will already have excluded that tab (see
  // ApexIntelligenceWorkspace's own hasYourRace check).
  const hasYourRace = !!(intelligence?.personalRaceBrief || intelligence?.favoriteDriverInsight || intelligence?.favoriteTeamInsight || intelligence?.personalOutlook);
  const quickJumps = QUICK_JUMPS.filter((q) => q.tab !== "yourRace" || hasYourRace);
  const hasConversation = messages.length > 0;

  const who = favoriteDriverName || favoriteTeamName;
  const placeholder = who ? `Ask about ${raceLabel}, ${who}, or the standings...` : `Ask about ${raceLabel}, drivers, or the standings...`;
  const emptyStateCopy = who
    ? `Ask me anything about ${raceLabel}, ${who}, or your predictions.`
    : `Ask about ${raceLabel}, drivers, teams, or the championship.`;

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
          className="glass-surface fixed bottom-4 right-4 z-[90] flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-left transition hover:brightness-110 sm:bottom-6 sm:right-6"
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
          className="glass-surface fixed inset-x-0 bottom-0 z-[100] flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-h-[78vh] sm:w-[26rem] sm:rounded-2xl lg:w-[28rem]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] p-4">
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
              className="rounded-md p-1 text-neutral-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              ×
            </button>
          </div>

          {/* Transcript - the primary surface once a conversation exists. */}
          <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
            {!hasConversation && <p className="text-xs text-neutral-500">{emptyStateCopy}</p>}
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                  <span
                    className={
                      m.role === "user"
                        ? "inline-block max-w-[85%] rounded-xl bg-[var(--f1-red)]/15 px-3 py-2 text-left text-sm text-white"
                        : "inline-block max-w-[85%] rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-sm text-neutral-200"
                    }
                  >
                    {m.content}
                  </span>
                </div>
              ))}
              {isSending && (
                <div className="text-left">
                  <span className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1 w-1 rounded-full bg-neutral-400"
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                      />
                    ))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {favoriteKeyChanged && (
            <div className="mx-4 mb-2 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100">
              Your favorites have changed. This conversation may be about your old one.{" "}
              <button type="button" onClick={startNewConversation} className="font-semibold underline hover:text-white">
                Start new conversation
              </button>
            </div>
          )}

          {/* Quick jumps - full-width buttons before any conversation starts; a small secondary
           * row once the transcript is the primary interaction (per review: never two competing
           * calls-to-action at once). */}
          {quickJumps.length > 0 && !hasConversation && (
            <div className="shrink-0 space-y-1 border-t border-white/[0.08] p-4 pt-3">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">Or jump straight to</p>
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
          )}
          {quickJumps.length > 0 && hasConversation && (
            <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t border-white/[0.08] px-4 pt-2 text-[11px]">
              {quickJumps.map((q) => (
                <button key={q.tab} type="button" onClick={() => jumpTo(q.tab)} className="text-neutral-500 underline-offset-2 transition hover:text-white hover:underline">
                  {q.question}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="flex shrink-0 items-center gap-2 border-t border-white/[0.08] p-3"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={isSending}
              className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-neutral-500 transition focus:border-white/25 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="shrink-0 rounded-lg bg-[var(--f1-red)] px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              Ask
            </button>
          </form>
        </motion.div>
      )}
    </>
  );
}
