import type { ReactNode } from "react";

/** Every major race-page section gets exactly this bounded container - the fix for "sections
 * simply stretching across the page instead of being contained in deliberate cards." Reuses
 * `.glass-surface` (already the Season page's own AnalysisWorkspace card treatment), not a new
 * style, so the two pages read as the same product. Visually distinct from the flatter
 * `bg-[var(--f1-carbon)]` cards already used inside some sections (PredictionComparison,
 * ModelInfo) - a frosted section around a solid sub-panel reads as "panel inside a section," not
 * a doubled border. */
export function RaceSectionCard({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="glass-surface rounded-2xl p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{title}</p>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
