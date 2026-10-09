"use client";

import { teamColor } from "@/lib/teamColors";

export type TickerItem = { key: string; position?: number; code: string; name: string; team?: string; value: string };

/**
 * A timing-board strip that slides the championship past (globals.css .ticker): position, team colour, driver,
 * points. Pauses on hover or focus; under reduced motion it is a still row you can scroll. The moving copy is
 * hidden from screen readers, which get the list once.
 */
export function StandingsTicker({ items, label }: { items: TickerItem[]; label: string }) {
  if (items.length === 0) return null;
  const row = (copy: number) =>
    items.map((it) => (
      <li key={`${copy}-${it.key}`} className="flex shrink-0 items-center gap-2.5 px-5 text-body-sm">
        {it.position !== undefined && <span className="tabular text-tertiary">{it.position}</span>}
        <span aria-hidden className="h-3.5 w-1 rounded-full" style={{ backgroundColor: it.team ? teamColor(it.team) : "var(--text-tertiary)" }} />
        <span className="font-semibold text-primary">{it.code}</span>
        <span className="hidden text-secondary sm:inline">{it.name}</span>
        <span className="tabular text-secondary">{it.value}</span>
      </li>
    ));
  return (
    <div className="ticker ticker-bleed relative overflow-hidden border-y border-white/[0.06] bg-black/20 py-3 backdrop-blur-sm" role="region" aria-label={label}>
      <ul className="sr-only">
        {items.map((it) => (
          <li key={it.key}>
            {it.position !== undefined ? `${it.position}. ` : ""}
            {it.name}, {it.value}
          </li>
        ))}
      </ul>
      <div aria-hidden className="ticker-fade pointer-events-none absolute inset-y-0 left-0 z-sticky w-16" />
      <div aria-hidden className="ticker-fade ticker-fade-end pointer-events-none absolute inset-y-0 right-0 z-sticky w-16" />
      <ul aria-hidden className="ticker-track flex w-max">
        {row(0)}
        {row(1)}
      </ul>
    </div>
  );
}

/** The championship as ticker items: "1 | ANT Kimi Antonelli 294 pts". */
export function standingsTickerItems(rows: { driver: string; driverName: string; team: string; points: number }[] | undefined): TickerItem[] {
  return (rows ?? []).map((r, i) => ({ key: r.driver, position: i + 1, code: r.driver, name: r.driverName, team: r.team, value: `${r.points} pts` }));
}
