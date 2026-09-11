/** Apex's per-section insight (Battles/Records/Progression/Compare) - plain editorial text, the
 * same small accent mark SeasonStory's own "Apex take" uses (one consistent AI identity across
 * the page, not a different visual treatment per section). No colored box: an alert-style
 * container around a normal sentence reads as a warning, not an insight. Shared by
 * AnalysisWorkspace's Battles/Records panels, ProgressionPanel, and ComparePanel instead of each
 * re-implementing its own version. */
export function SeasonInsight({ headline, summary }: { headline: string; summary: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline gap-1.5">
        <span aria-hidden className="text-xs text-[var(--f1-red)]">
          ✦
        </span>
        <p className="text-sm font-semibold text-white">{headline}</p>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-neutral-400">{summary}</p>
    </div>
  );
}
