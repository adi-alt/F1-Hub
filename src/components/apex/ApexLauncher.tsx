"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/providers/AuthProvider";
import { useApexScope, type ApexScope } from "./ApexScopeProvider";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Reach = "page" | "everything";

const CAPACITY_FALLBACK = "Apex is at capacity right now - try again in a moment.";
const NETWORK_FALLBACK = "Couldn't reach Apex just now - check your connection and try again.";

/**
 * The single, global Apex entry point - a floating trigger on every page, replacing the
 * homepage-only widget.
 *
 * What makes it page-aware rather than a generic chat bubble: it answers from whatever scope the
 * current page registered (see ApexScopeProvider), shows that scope to the user, and resets the
 * transcript when the scope changes, because answers grounded in one page's facts would be
 * misleading carried into another's.
 *
 * It renders nothing at all on a page that registered no scope. An Apex that cheerfully opens on a
 * page it knows nothing about, and then can't answer anything, is worse than no Apex there.
 */
export function ApexLauncher() {
  const { isAuthorized } = useAuth();
  const scope = useApexScope();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reach, setReach] = useState<Reach>("page");
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const scopeKey = scope?.key ?? null;
  const [lastScopeKey, setLastScopeKey] = useState(scopeKey);

  // A new page means new grounding facts, so the old transcript no longer describes what Apex can
  // actually see - it's reset rather than left sitting above unrelated answers.
  //
  // Adjusted during render rather than in an effect: this is React's own documented pattern for
  // resetting state when a prop changes (react.dev/learn/you-might-not-need-an-effect). An effect
  // would render the stale transcript once against the new scope before clearing it, and costs an
  // extra render every navigation.
  if (scopeKey !== lastScopeKey) {
    setLastScopeKey(scopeKey);
    setMessages([]);
    setInput("");
    setReach("page");
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  if (!isAuthorized || !scope) return null;

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || sending || !scope) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);

    const res = await fetch("/api/ai/ask-apex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: trimmed,
        history: messages.slice(-6),
        // Widening deliberately drops the page's own snapshot rather than adding to it: "Entire F1
        // HUB" means general F1 knowledge, not this page's facts plus someone else's.
        intelligenceSnapshot: reach === "page" ? scope.snapshot : {},
        scope: { key: scope.key, label: scope.label, communityId: scope.communityId ?? null, reach },
      }),
    }).catch(() => null);

    const body = (await res?.json().catch(() => null)) as { answer?: string; error?: string } | null;
    setSending(false);

    if (!res?.ok || !body?.answer) {
      setMessages((prev) => [...prev, { role: "assistant", content: body?.error ? CAPACITY_FALLBACK : NETWORK_FALLBACK }]);
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", content: body.answer as string }]);
  }

  return (
    <>
      {/* Bottom-left rather than bottom-right: the right is where this app's own scroll affordances
          and a browser's own UI tend to sit, and the ask was explicitly that it not block controls. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Ask Apex"
        className="fixed bottom-4 left-4 z-[90] flex items-center gap-1.5 rounded-full border border-white/15 bg-zinc-900/90 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition hover:border-white/30 hover:bg-zinc-800/90 sm:bottom-5 sm:left-5"
      >
        <span aria-hidden className="text-[var(--f1-red)]">
          ✦
        </span>
        Apex
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Ask Apex"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed inset-x-3 bottom-3 z-[95] flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[26rem]"
          >
            <ScopeHeader scope={scope} reach={reach} onReach={setReach} onClose={() => setOpen(false)} />

            <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <Starters scope={scope} reach={reach} onPick={(q) => void ask(q)} />
              ) : (
                <div className="space-y-3">
                  {messages.map((message, i) => (
                    <div key={i} className={message.role === "user" ? "text-right" : ""}>
                      <p
                        className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                          message.role === "user" ? "bg-white/[0.08] text-white" : "bg-black/30 text-neutral-300"
                        }`}
                      >
                        {message.content}
                      </p>
                    </div>
                  ))}
                  {sending && (
                    <p className="inline-block rounded-xl bg-black/30 px-3 py-2 text-sm text-neutral-500">
                      <span className="inline-flex gap-1">
                        <Dot delay={0} />
                        <Dot delay={0.15} />
                        <Dot delay={0.3} />
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
              className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-2.5"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder={reach === "page" ? `Ask about ${scope.label}...` : "Ask anything about F1..."}
                aria-label="Ask Apex a question"
                className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="shrink-0 rounded-full bg-[var(--f1-red)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                Ask
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** The scope indicator, and the one control that widens it. The user should always be able to see
 * what Apex is looking at. */
function ScopeHeader({ scope, reach, onReach, onClose }: { scope: ApexScope; reach: Reach; onReach: (reach: Reach) => void; onClose: () => void }) {
  return (
    <header className="shrink-0 border-b border-white/10 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Apex is looking at</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{reach === "page" ? scope.label : "Everything on F1 HUB"}</p>
          {reach === "page" && scope.sublabel && <p className="truncate text-[11px] text-neutral-500">{scope.sublabel}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="Close Apex"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white"
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden>
            <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {scope.widenable !== false && (
        <div className="mt-2.5 flex gap-1" role="radiogroup" aria-label="Apex scope">
          {(
            [
              { value: "page" as const, label: "This page" },
              { value: "everything" as const, label: "All of F1 HUB" },
            ]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={reach === option.value}
              onClick={() => onReach(option.value)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                reach === option.value ? "bg-white/[0.1] text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

function Starters({ scope, reach, onPick }: { scope: ApexScope; reach: Reach; onPick: (question: string) => void }) {
  // Page suggestions are only honest while the page's own facts are in play - widened, they might
  // reference data that's no longer being sent.
  const suggestions = reach === "page" ? (scope.suggestions ?? []) : [];

  return (
    <div className="py-2">
      <p className="text-sm leading-relaxed text-neutral-400">
        {reach === "page" ? (
          <>
            Ask me about <span className="text-neutral-200">{scope.label}</span>. I only use what&apos;s on this page.
          </>
        ) : (
          "Ask me anything about Formula 1."
        )}
      </p>
      {suggestions.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {suggestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onPick(question)}
              className="block w-full rounded-lg border border-[var(--f1-line)] px-3 py-2 text-left text-xs text-neutral-300 transition hover:border-white/25 hover:bg-white/[0.03] hover:text-white"
            >
              {question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay }} className="h-1.5 w-1.5 rounded-full bg-neutral-500" />;
}
