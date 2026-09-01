import type { ReactNode } from "react";

/** Every major race-page section gets exactly this bounded container - the same solid, restrained
 * surface the Season Championship table's own container uses (`rounded-xl border
 * border-[var(--f1-line)] bg-[var(--f1-carbon)]/60`, see ChampionshipStandings.tsx), not
 * `.glass-surface` - that class is deliberately reserved for floating controls and contextual
 * overlays (its own comment says so explicitly), and applying it to every major section is what
 * made the race page read as a stack of heavy gray cards instead of an extension of the Season
 * page's own table-like language. No backdrop-filter/gradient/heavy shadow here - separation comes
 * from the same thin border + flat translucent fill + spacing the table already relies on. */
export function RaceSectionCard({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{title}</p>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
