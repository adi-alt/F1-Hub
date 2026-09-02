"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

/** Every major race-page section gets exactly this bounded container - the same solid, restrained
 * surface the Season Championship table's own container uses (`rounded-xl border
 * border-[var(--f1-line)] bg-[var(--f1-carbon)]/60`, see ChampionshipStandings.tsx), not
 * `.glass-surface` - that class is deliberately reserved for floating controls and contextual
 * overlays (its own comment says so explicitly), and applying it to every major section is what
 * made the race page read as a stack of heavy gray cards instead of an extension of the Season
 * page's own table-like language. No backdrop-filter/gradient/heavy shadow here - separation comes
 * from the same thin border + flat translucent fill + spacing the table already relies on.
 *
 * `motion.section layout` - when a child inside grows/shrinks (a driver-set switch, "Show all",
 * a chart finishing its fetch), this card's own height animates along with it instead of snapping
 * instantly while the child animates smoothly, which would look like the card and its content
 * disagreeing about the height change. */
export function RaceSectionCard({
  id,
  title,
  description,
  headerRight,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  // A right-aligned control for the whole section, next to the title itself.
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section layout id={id} className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{title}</p>
        {headerRight}
      </div>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}
