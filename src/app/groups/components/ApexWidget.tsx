"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { askApex } from "@/components/apex/askApex";
import { useApexScope } from "@/components/apex/ApexScopeProvider";
import type { SharedCircuitIntelligence } from "@/lib/ai/schemas/seasonIntelligence";

type Take = NonNullable<SharedCircuitIntelligence["trackTake"]>;

/** Complete short labels for the page's Apex questions, so a button never ends mid-word; the full question is what
 * gets asked (and what the button's accessible name says). Anything unlisted shows in full, wrapping to two lines. */
const SHORT_LABEL: Record<string, string> = {
  "What's happening across my communities?": "What's new in my communities?",
  "Which predictions close soonest?": "Which rounds close soonest?",
  "Which of my communities is most active?": "Which community is most active?",
  "What is this community discussing most?": "What's this community discussing?",
  "Summarise the recent posts here.": "Summarise recent posts",
  "Are there any open predictions in this community?": "Any open rounds here?",
};

/**
 * Apex on this page: its read on the circuit the next round is at, then questions to ask it about your
 * communities, each opening the Apex chat already asked.
 *
 * The take is the existing /api/ai/circuit-take endpoint the circuit pages use (same prompt, same server-side
 * grounding, same shared cache entry), so it adds no second generation path and can't contradict the circuit page.
 * Only `trackTake` is shown; the other blocks are a page's worth of reading. With no grounded take (a venue with
 * little history) the take is simply left out. The questions are the page's own registered Apex suggestions, which
 * the community grounding builder is written to answer. Labelled as AI and kept quieter than the facts around it
 * (design spec §4.11, AiSummary).
 */
export function ApexWidget({ location, year }: { location: string | null; year: number | null }) {
  const scope = useApexScope();
  const key = location && year ? `${location}:${year}` : null;
  const [result, setResult] = useState<{ key: string; take: Take | null } | null>(null);

  useEffect(() => {
    if (!location || !year || !key) return;
    const controller = new AbortController();
    fetch("/api/ai/circuit-take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, year }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ content?: SharedCircuitIntelligence; location?: string }>) : null))
      // A reply for a circuit that's no longer the one asked about is dropped.
      .then((body) => setResult({ key, take: body?.location === location ? (body.content?.trackTake ?? null) : null }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, take: null });
      });
    return () => controller.abort();
  }, [location, year, key]);

  const [expanded, setExpanded] = useState(false);
  // Whether the clamped summary actually hides text, measured (not guessed from its length), so Show more only
  // appears when there is more. Re-measured when the rail resizes; kept while expanded so Show less stays.
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = summaryRef.current;
    if (!el || expanded) return;
    const ro = new ResizeObserver(() => setOverflows(el.scrollHeight > el.clientHeight + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, result]);
  const loading = !!key && result?.key !== key;
  const take = result?.key === key ? result.take : null;
  const questions = (scope?.suggestions ?? []).slice(0, 3);
  if (!loading && !take && questions.length === 0) return null;

  return (
    <section aria-labelledby="apex-widget">
      <div className="flex items-center justify-between gap-2">
        <h3 id="apex-widget" className="flex items-center gap-1.5 text-body-sm font-semibold text-primary">
          <Icon icon={Sparkles} size={16} className="text-secondary" />
          Apex
        </h3>
        <span className="text-caption text-tertiary">AI summary</span>
      </div>

      {loading ? (
        <div aria-busy className="mt-3 space-y-2">
          <span className="block h-3.5 w-3/4 animate-pulse rounded bg-white/[0.08]" />
          <span className="block h-3 w-full animate-pulse rounded bg-white/[0.08]" />
          <span className="block h-3 w-5/6 animate-pulse rounded bg-white/[0.08]" />
        </div>
      ) : take ? (
        <div className="mt-2">
          <p className="text-body-sm font-medium text-primary">{take.headline}</p>
          <p ref={summaryRef} id="apex-take" className={`mt-1 text-body-sm text-secondary ${expanded ? "" : "line-clamp-3"}`}>
            {take.summary}
          </p>
          {/* An explicit toggle rather than a mid-word ellipsis left as the only ending. */}
          {(overflows || expanded) && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls="apex-take"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 rounded-control text-caption font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      ) : null}

      {questions.length > 0 && (
        <ul className="mt-3 space-y-1">
          {questions.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => askApex(q)}
                aria-label={`Ask Apex: ${q}`}
                className="group flex w-full items-start gap-2 rounded-control bg-white/[0.05] px-3 py-2 text-left text-body-sm text-primary/90 transition-colors duration-fast hover:bg-white/[0.09] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className="min-w-0 flex-1 line-clamp-2">{SHORT_LABEL[q] ?? q}</span>
                <Icon icon={ArrowUpRight} size={16} className="mt-0.5 shrink-0 text-tertiary group-hover:text-primary" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
