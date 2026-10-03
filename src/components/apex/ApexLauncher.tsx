"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { fieldControlClass } from "@/components/ui/Field";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
import { useAuth } from "@/providers/AuthProvider";
import { useApexScope, type ApexScope } from "./ApexScopeProvider";

/** `notice`: not something Apex said - "at capacity", "couldn't reach Apex". Shown as a notice,
 * never sent back as conversation history (audit AI-16). */
type ChatMessage = { role: "user" | "assistant"; content: string; notice?: boolean };
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
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Tab stays inside the panel, Escape closes it and focus goes back to the launcher (audit UI-30).
  // No scroll lock: the panel is meant to sit beside the page it is answering about. Declared before
  // the effect below, so the trap records the launcher as the place to return focus to first.
  const close = useCallback(() => setOpen(false), []);
  useModalFocusTrap(panelRef, open, close, { lockScroll: false });

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
        history: messages
          .filter((m) => !m.notice)
          .slice(-6)
          .map(({ role, content }) => ({ role, content })),
        // Widening deliberately drops the page's own snapshot rather than adding to it: "Entire F1
        // HUB" means general F1 knowledge, not this page's facts plus someone else's.
        context: reach === "page" ? scope.context : { page: "home", snapshot: {} },
        scope: { key: scope.key, label: scope.label, communityId: scope.communityId ?? null, reach },
      }),
    }).catch(() => null);

    const body = (await res?.json().catch(() => null)) as { answer?: string; error?: string; isFallback?: boolean } | null;
    setSending(false);

    if (!res?.ok || !body?.answer) {
      setMessages((prev) => [...prev, { role: "assistant", content: body?.error ? CAPACITY_FALLBACK : NETWORK_FALLBACK, notice: true }]);
      return;
    }
    // The route's own fallback ("at capacity") arrives as an answer, flagged: still a notice.
    setMessages((prev) => [...prev, { role: "assistant", content: body.answer as string, notice: body.isFallback === true }]);
  }

  return (
    <>
      {/* Bottom-left rather than bottom-right: the right is where this app's own scroll affordances
          and a browser's own UI tend to sit, and the ask was explicitly that it not block controls.
          z-popover: above the page and the header, below dialogs and sheets (it sat on top of the
          mobile menu at its old hard-coded 90). The panel, later in the DOM, stacks above the launcher. */}
      {/* The wrapper is what's fixed: Button carries its own `relative` (for its loading spinner),
          which would win over a `fixed` passed in its className. */}
      <div className="fixed bottom-4 left-4 z-popover sm:bottom-5 sm:left-5">
        <Button variant="secondary" size="md" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Ask Apex" data-tour="apex-launcher" className="shadow-overlay">
          <span aria-hidden className="text-brand-text">
            ✦
          </span>
          Apex
        </Button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label="Ask Apex"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed inset-x-3 bottom-3 z-popover flex max-h-[75vh] flex-col overflow-hidden rounded-overlay surface-glass shadow-overlay sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[26rem]"
          >
            <ScopeHeader scope={scope} reach={reach} onReach={setReach} onClose={close} />

            <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <Starters scope={scope} reach={reach} onPick={(q) => void ask(q)} />
              ) : (
                // role="log": a polite live region, so each answer is read out when it arrives.
                <div role="log" aria-label="Conversation with Apex" className="space-y-3">
                  {messages.map((message, i) =>
                    message.notice ? (
                      <p key={i} className="flex items-start gap-1.5 text-body-sm text-tertiary">
                        <Info aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                        {message.content}
                      </p>
                    ) : (
                      <div key={i} className={message.role === "user" ? "text-right" : ""}>
                        <p
                          className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-2 text-body-sm ${
                            message.role === "user" ? "bg-surface-3 text-primary" : "bg-surface-2 text-primary"
                          }`}
                        >
                          {message.content}
                        </p>
                      </div>
                    ),
                  )}
                  {sending && (
                    <p className="inline-block rounded-card bg-surface-2 px-3 py-2 text-body-sm text-tertiary">
                      <span className="sr-only">Apex is answering…</span>
                      <span aria-hidden className="inline-flex gap-1">
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
              className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-3"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder={reach === "page" ? `Ask about ${scope.label}...` : "Ask anything about F1..."}
                aria-label="Ask Apex a question"
                className={`min-w-0 flex-1 ${fieldControlClass(false)}`}
              />
              <Button type="submit" variant="primary" size="md" disabled={!input.trim()} loading={sending} className="shrink-0">
                Ask
              </Button>
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
          <p className="text-caption font-semibold uppercase tracking-wide text-tertiary">Apex is looking at</p>
          <p className="mt-0.5 truncate text-body-sm font-semibold text-primary">{reach === "page" ? scope.label : "Everything on F1 HUB"}</p>
          {reach === "page" && scope.sublabel && <p className="truncate text-caption text-tertiary">{scope.sublabel}</p>}
        </div>
        <Button variant="ghost" size="sm" iconOnly iconStart={X} aria-label="Close Apex" onClick={onClose} className="-mr-1.5 -mt-1" />
      </div>

      {scope.widenable !== false && (
        // The spec's segmented look for a small two-way switch (§4.6): rounded rectangles in one
        // outlined group. Radio semantics, since it is one choice of two.
        <div className="mt-2.5 inline-flex gap-0.5 rounded-control border border-white/12 p-0.5" role="radiogroup" aria-label="Apex scope">
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
              className={`h-7 rounded-control px-2.5 text-caption font-medium transition-colors duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none ${
                reach === option.value ? "bg-surface-3 text-primary" : "text-tertiary hover:text-primary"
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
      <p className="text-body-sm text-secondary">
        {reach === "page" ? (
          <>
            Ask me about <span className="text-primary">{scope.label}</span>. I only use what&apos;s on this page.
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
              className="block w-full rounded-control border border-strong px-3 py-2 text-left text-body-sm text-secondary transition-colors duration-fast ease-standard hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none"
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
