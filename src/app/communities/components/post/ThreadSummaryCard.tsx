"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, ChevronDown, CheckCircle2, RefreshCw, MessageSquareDashed, HelpCircle, Flame } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { ThreadSummary } from "@/lib/ai/threadSummary";

export function ThreadSummaryCard({ postId, commentCount }: { postId: string; commentCount: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ThreadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchSummary() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/thread-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Could not generate discussion summary");
      }
      const data = (await res.json()) as { summary: ThreadSummary };
      setSummary(data.summary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !summary && !loading) {
      void fetchSummary();
    }
  }

  // Only offer summary if thread has at least 2 comments
  if (commentCount < 2) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-card border border-brand/25 bg-gradient-to-r from-brand/10 via-surface-1/80 to-surface-1/40 backdrop-blur-md transition-all">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-control bg-brand/20 text-brand">
            <Icon icon={Sparkles} size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-semibold text-primary">Catch Me Up</span>
              <span className="rounded-control bg-brand/15 px-1.5 py-0.5 text-caption font-medium text-brand">
                AI Summary
              </span>
            </div>
            <p className="text-caption text-tertiary">
              Key debate points, consensus & open questions across {commentCount} comments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-tertiary">
          <Icon
            icon={ChevronDown}
            size={16}
            className={`transition-transform duration-fast ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-brand/15 px-3.5 pb-3.5 pt-2"
          >
            {loading && (
              <div className="flex flex-col gap-2 py-4">
                <div className="flex items-center gap-2 text-caption text-secondary">
                  <Icon icon={Sparkles} size={16} className="size-3.5 animate-spin text-brand" />
                  <span>Apex is analyzing {commentCount} comments...</span>
                </div>
                <div className="h-4 w-3/4 animate-pulse rounded-control bg-white/5" />
                <div className="h-4 w-5/6 animate-pulse rounded-control bg-white/5" />
                <div className="h-4 w-2/3 animate-pulse rounded-control bg-white/5" />
              </div>
            )}

            {error && (
              <div className="py-2">
                <p className="text-caption text-danger">{error}</p>
                <Button variant="ghost" size="sm" onClick={() => void fetchSummary()} className="mt-1">
                  Try again
                </Button>
              </div>
            )}

            {summary && !loading && (
              <div className="flex flex-col gap-3 pt-1">
                {/* TL;DR */}
                <div className="rounded-control border border-white/5 bg-surface-2/60 p-2.5">
                  <p className="text-body-sm leading-relaxed text-primary font-medium">
                    {summary.tldr}
                  </p>
                </div>

                {/* Consensus */}
                {summary.consensus.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-success">
                      <Icon icon={CheckCircle2} size={16} className="size-3.5" />
                      <span>Consensus</span>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {summary.consensus.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-caption text-secondary">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-success/60" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Debates */}
                {summary.debates.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-amber-400">
                      <Icon icon={Flame} size={16} className="size-3.5" />
                      <span>Key Debates</span>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {summary.debates.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-caption text-secondary">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-400/60" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Open Questions */}
                {summary.openQuestions.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-cyan-400">
                      <Icon icon={HelpCircle} size={16} className="size-3.5" />
                      <span>Unresolved Questions</span>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {summary.openQuestions.map((q, i) => (
                        <li key={i} className="flex items-start gap-2 text-caption text-secondary">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-cyan-400/60" />
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Footer metadata & refresh */}
                <div className="mt-1 flex items-center justify-between border-t border-white/5 pt-2 text-caption text-tertiary">
                  <div className="flex items-center gap-1.5">
                    <Icon icon={MessageSquareDashed} size={16} className="size-3.5" />
                    <span>Based on {summary.commentCount} comments</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchSummary()}
                    className="flex items-center gap-1 text-tertiary transition-colors hover:text-primary"
                    title="Refresh summary"
                  >
                    <Icon icon={RefreshCw} size={16} className="size-3" />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
