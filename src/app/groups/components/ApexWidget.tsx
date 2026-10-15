"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { askApex } from "@/components/apex/askApex";
import { useApexScope } from "@/components/apex/ApexScopeProvider";
import type { SharedCircuitIntelligence } from "@/lib/ai/schemas/seasonIntelligence";

type Take = NonNullable<SharedCircuitIntelligence["trackTake"]>;

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

  const loading = !!key && result?.key !== key;
  const take = result?.key === key ? result.take : null;
  const questions = (scope?.suggestions ?? []).slice(0, 3);
  if (!loading && !take && questions.length === 0) return null;

  return (
    <section aria-labelledby="apex-widget">
      <div className="flex items-center justify-between gap-2">
        <h3 id="apex-widget" className="flex items-center gap-1.5 text-body font-semibold text-primary">
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
          <p className="mt-1 line-clamp-3 text-body-sm text-secondary">{take.summary}</p>
        </div>
      ) : null}

      {questions.length > 0 && (
        <ul className="mt-3 space-y-1">
          {questions.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => askApex(q)}
                className="group flex w-full items-center gap-2 rounded-control bg-white/[0.05] px-3 py-2 text-left text-body-sm text-secondary transition-colors duration-fast hover:bg-white/[0.09] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className="min-w-0 flex-1 truncate">{q}</span>
                <Icon icon={ArrowUpRight} size={16} className="shrink-0 text-tertiary group-hover:text-primary" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
