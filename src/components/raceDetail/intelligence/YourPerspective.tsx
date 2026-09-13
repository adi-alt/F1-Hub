"use client";

import type { PersonalRaceInsight } from "@/lib/ai/schemas/raceIntelligence";

/** The shift from "the race" to "your race" should be visible, not just a heading change - so this
 * opens with a real stat block (your driver's finish, your team's finish - the two pre-formatted
 * facts the route already computed from real results, zero AI involved) before the generated
 * interpretation. No "your prediction vs. outcome" line: no per-user race prediction exists in this
 * context, so it's left out rather than invented. */
export function YourPerspective({
  personal,
  personalFacts,
}: {
  personal: PersonalRaceInsight;
  personalFacts: { driver: string | null; team: string | null };
}) {
  const stats = [personalFacts.driver, personalFacts.team].filter((s): s is string => !!s);

  return (
    <div className="rounded-lg border border-[var(--f1-red)]/20 bg-[var(--f1-red)]/[0.04] p-4">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white">Your Perspective</p>
      </div>
      {stats.length > 0 && (
        <ul className="mt-3 space-y-1 border-b border-white/[0.06] pb-3 text-sm text-neutral-300">
          {stats.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm font-medium text-white">{personal.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-400">{personal.explanation}</p>
    </div>
  );
}
