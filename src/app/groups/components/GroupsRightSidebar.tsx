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

/** Real closing signal, not a fabricated "closing soon" badge - the same raceDate this row already
 * carries, run through the exact countdown utility PredictionCard itself uses, ticked off the same
 * shared per-minute clock rather than a second interval. Null when there's no date yet, which
 * `listMyOpenPredictions` already returns honestly for a round the pipeline hasn't dated. */
function ActivePredictions({ predictions }: { predictions: FeedPrediction[] }) {
  const now = useMinuteClock();

  return (
    <div>
      <p className="px-3.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Active predictions</p>
      {predictions.length === 0 ? (
        <p className="px-3.5 pt-1.5 text-xs leading-relaxed text-neutral-600">No active predictions. New markets appear as race weekend approaches.</p>
      ) : (
        <div className="mt-1.5">
          {predictions.map((p) => {
            const raceAt = p.raceDate ? parseUtcDateTime(p.raceDate).getTime() : null;
            const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
            return (
              // Deep-links straight to the Predictions tab. This used to be a plain groupHref with
              // a note explaining that tab state wasn't URL-backed so there was nothing to link to
              // - CommunityTabs puts the active tab in ?tab= now, so there is.
              <Link
                key={p.id}
                href={`${groupHref(p.groupId)}?tab=predictions`}
                className="block px-3.5 py-2 transition hover:bg-white/[0.04]"
              >
                <p className="truncate text-xs font-semibold text-white">{p.raceName}</p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                  {predictionTypeLabels[p.type]} · {p.groupName}
                </p>
                <p className="mt-1 text-[11px] text-neutral-400">
                  {p.hasEntered ? (
                    "Already predicted"
                  ) : (
                    <>Entry: {p.entryPoints} pts</>
                  )}
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

function NextRaceWidget({ race }: { race: NextRace }) {
  return (
    <div className="px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Next race</p>
      {!race ? (
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">No upcoming race is scheduled yet.</p>
      ) : (
        <>
          <p className="mt-1.5 truncate text-sm font-semibold text-white">{race.name}</p>
          {race.raceDate && (
            <p className="mt-0.5 text-xs text-neutral-500">{new Date(race.raceDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
          )}
          <Link href={raceHref(race.year, race.round, race.name)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-neutral-300 transition hover:text-white">
            View race <span aria-hidden>→</span>
          </Link>
        </>
      )}
    </div>
  );
}

/** F1-specific context, not more group metadata (the request's own "right sidebar should be
 * F1-specific, not generic group information" point) - real active predictions across joined
 * groups, the real next race, nothing fabricated.
 *
 * One surface, not three separate bordered cards - a single "Context" shell with `divide-y`
 * between sections. That's the actual fix for the rail reading as "two random cards": it's now one
 * quieter, lighter-weight object next to the feed rather than a stack of boxes at the same visual
 * weight as the center column's own content. */
export function GroupsRightSidebar({ predictions, nextRace, onDiscover }: { predictions: FeedPrediction[]; nextRace: NextRace; onDiscover: () => void }) {
  return (
    <div className="divide-y divide-white/[0.06] rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 py-3">
      <ActivePredictions predictions={predictions} />
      <NextRaceWidget race={nextRace} />
      <div className="px-3.5 pt-3">
        <button type="button" onClick={onDiscover} className="text-xs text-neutral-500 transition hover:text-white">
          Discover more communities →
        </button>
      </div>
    </div>
  );
}
