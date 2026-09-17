"use client";

import Link from "next/link";
// predictionTypeLabels from the pure groupPredictionTypes.ts, not groupPredictions.ts - the same
// nodemailer-in-client-bundle crash this session has already hit twice (see that file's own
// comment). FeedPrediction is a type-only import, which is always erased regardless of source.
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import { groupHref, raceHref } from "@/lib/routes";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";

type NextRace = { year: number; round: number; name: string; raceDate: string | null } | null;

/** The rail's own top module - the real next race on the calendar, styled like the rest of this
 * app's race surfaces (RaceQuickView's own "Round N" eyebrow over the race name) rather than a
 * generic "card with a title" - this is what makes the rail read as F1 HUB context, not a second
 * feed. Real data only: no live countdown clock here (that needs session-level timing this widget
 * doesn't fetch), just the actual date. */
function NextRaceWidget({ race }: { race: NextRace }) {
  return (
    <div className="px-1 pb-4 pt-2">
      {!race ? (
        <p className="text-xs leading-relaxed text-neutral-600">No upcoming race is scheduled yet.</p>
      ) : (
        <Link href={raceHref(race.year, race.round, race.name)} className="group block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">Round {race.round}</p>
          <p className="mt-1 truncate text-base font-semibold tracking-[-0.01em] text-white transition group-hover:text-neutral-200">{race.name}</p>
          {race.raceDate && (
            <p className="mt-0.5 text-xs text-neutral-500">{new Date(race.raceDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
          )}
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-neutral-400 transition group-hover:text-white">
            View race
            <ChevronIcon />
          </span>
        </Link>
      )}
    </div>
  );
}

/** Real closing signal, not a fabricated "closing soon" badge - the same raceDate this row already
 * carries, run through the exact countdown utility PredictionCard itself uses, ticked off the same
 * shared per-minute clock rather than a second interval. Null when there's no date yet, which
 * `listMyOpenPredictions` already returns honestly for a round the pipeline hasn't dated. */
function ActivePredictions({ predictions }: { predictions: FeedPrediction[] }) {
  const now = useMinuteClock();

  return (
    <div className="border-t border-white/[0.06] px-1 pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">Active predictions</p>
      {predictions.length === 0 ? (
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">No active predictions. New markets appear as race weekend approaches.</p>
      ) : (
        <div className="-mx-1 mt-1">
          {predictions.map((p) => {
            const raceAt = p.raceDate ? parseUtcDateTime(p.raceDate).getTime() : null;
            const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
            return (
              // Deep-links straight to the Predictions tab. This used to be a plain groupHref with
              // a note explaining that tab state wasn't URL-backed so there was nothing to link to
              // - CommunityTabs puts the active tab in ?tab= now, so there is.
              <Link key={p.id} href={`${groupHref(p.groupId)}?tab=predictions`} className="block rounded-md px-1 py-1.5 transition hover:bg-white/[0.04]">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-semibold text-white">{p.raceName}</p>
                  {p.hasEntered ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">Entered</span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-medium text-neutral-400">{p.entryPoints} pts</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                  {predictionTypeLabels[p.type]} · {p.groupName}
                  {countdown && <span className="text-neutral-600"> · Closes in {countdown}</span>}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A plain chevron, not "->" - every directional affordance in this rail uses this instead of an
 * ASCII arrow. */
function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" width="9" height="9" fill="none" aria-hidden>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** F1-specific context, not more group metadata, and not a second content column - real active
 * predictions across joined groups, the real next race, an explore module, nothing fabricated.
 *
 * ONE frosted surface for the whole rail - the same static-surface treatment (rounded-xl border
 * bg-carbon/60) every other real content surface in this app already uses, not three separate
 * boxes and not zero surface at all (both tried in earlier passes - the first read as "another
 * card column", the second read as it belonged to no surface at all). "Race weekend" groups the
 * two F1-specific modules under one eyebrow; a horizontal rule (not a second card boundary)
 * separates that group from Explore below it - one widget with internal structure, not three. */
export function GroupsRightSidebar({ predictions, nextRace, onDiscover }: { predictions: FeedPrediction[]; nextRace: NextRace; onDiscover: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 py-3">
      <p className="px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-600">Race weekend</p>
      <div className="px-3">
        <NextRaceWidget race={nextRace} />
        <ActivePredictions predictions={predictions} />
      </div>

      <div className="mt-1 border-t border-[var(--f1-line)] px-3 pt-4">
        <button type="button" onClick={onDiscover} className="group flex w-full items-center gap-2.5 px-1 text-left">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-neutral-500 transition group-hover:text-neutral-300">
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden>
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="m11.8 7.2-1.5 3.8a1 1 0 0 1-.5.5l-3.8 1.5 1.5-3.8a1 1 0 0 1 .5-.5l3.8-1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Explore</span>
            <span className="block text-xs font-medium text-neutral-300 transition group-hover:text-white">Discover communities</span>
          </span>
          <ChevronIcon />
        </button>
      </div>
    </div>
  );
}
