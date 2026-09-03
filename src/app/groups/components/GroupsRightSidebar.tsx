"use client";

import Link from "next/link";
// predictionTypeLabels from the pure groupPredictionTypes.ts, not groupPredictions.ts - the same
// nodemailer-in-client-bundle crash this session has already hit twice (see that file's own
// comment). FeedPrediction is a type-only import, which is always erased regardless of source.
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import { groupHref, raceHref } from "@/lib/routes";

type NextRace = { year: number; round: number; name: string; raceDate: string | null } | null;

function ActivePredictions({ predictions }: { predictions: FeedPrediction[] }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Active Predictions</p>
      {predictions.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-600">No active predictions. New markets appear as race weekend approaches.</p>
      ) : (
        <div className="mt-2.5 space-y-2.5">
          {predictions.map((p) => (
            // groupHref, not a #predictions-tab deep link - GroupDetailTabs' tab state isn't
            // URL-backed, so there's nothing to actually link straight to.
            <Link key={p.id} href={groupHref(p.groupId)} className="block rounded-lg border border-[var(--f1-line)] bg-black/20 p-2.5 transition hover:border-white/20">
              <p className="truncate text-xs font-semibold text-white">{p.raceName}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {predictionTypeLabels[p.type]} · {p.groupName}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">{p.hasEntered ? "Already predicted" : `Entry: ${p.entryPoints} pts`}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NextRaceCard({ race }: { race: NextRace }) {
  if (!race) return null;
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Next Race</p>
      <p className="mt-1.5 text-sm font-semibold text-white">{race.name}</p>
      {race.raceDate && (
        <p className="mt-0.5 text-xs text-neutral-500">{new Date(race.raceDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
      )}
      <Link href={raceHref(race.year, race.round, race.name)} className="mt-2.5 block rounded-lg border border-[var(--f1-line)] px-3 py-1.5 text-center text-xs font-medium text-neutral-300 transition hover:border-white/20 hover:text-white">
        View Race →
      </Link>
    </div>
  );
}

/** F1-specific context, not more group metadata (the request's own "right sidebar should be
 * F1-specific, not generic group information" point) - real active predictions across joined
 * groups, the real next race, nothing fabricated. No live "3d 4h" countdown - that needs session-
 * level start times this widget doesn't fetch; a plain date is real and honest instead. */
export function GroupsRightSidebar({ predictions, nextRace }: { predictions: FeedPrediction[]; nextRace: NextRace }) {
  return (
    <div className="space-y-4">
      <ActivePredictions predictions={predictions} />
      <NextRaceCard race={nextRace} />
    </div>
  );
}
