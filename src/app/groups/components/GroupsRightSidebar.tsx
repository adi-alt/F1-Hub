"use client";

import Image from "next/image";
import Link from "next/link";
// predictionTypeLabels from the pure groupPredictionTypes.ts, not groupPredictions.ts - the same
// nodemailer-in-client-bundle crash this session has already hit twice (see that file's own
// comment). FeedPrediction is a type-only import, which is always erased regardless of source.
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import { groupHref, raceHref } from "@/lib/routes";
import { countryFlag } from "@/lib/countryFlag";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";

export type NextRace = { year: number; round: number; name: string; raceDate: string | null; country: string | null; photoUrl: string | null } | null;

/**
 * Race-weekend context, as ONE frosted widget with internal sections - not three cards stacked
 * next to the feed, and not three pieces of bare content either.
 *
 * Every value here is real: the round/name/date/country/photo are the pipeline's own race row, the
 * countdown is that row's real `race_date` run through the same formatCountdown/useMinuteClock pair
 * PredictionCard already uses, and the predictions are listMyOpenPredictions' real open rounds.
 * Nothing is a placeholder. Where a field is genuinely absent (a calendar round the pipeline hasn't
 * dated yet, a race with no photo) that piece simply doesn't render.
 */
export function GroupsRightSidebar({ predictions, nextRace, onDiscover }: { predictions: FeedPrediction[]; nextRace: NextRace; onDiscover: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 backdrop-blur-sm">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
        <RaceWeekend race={nextRace} />

        <div className="border-t border-white/[0.06] px-4 py-4">
          <ActivePredictions predictions={predictions} />
        </div>

        <div className="border-t border-white/[0.06] p-4">
          <button
            type="button"
            onClick={onDiscover}
            className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--f1-red)]/15 text-[var(--f1-red)]">
              <CompassIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Explore communities</span>
              <span className="mt-0.5 block truncate text-[11px] text-neutral-500">Find new communities to join</span>
            </span>
            <span className="shrink-0 text-neutral-600 transition group-hover:text-white">
              <ChevronIcon />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** The header module: the real next race, over its own real photo where the pipeline has one. The
 * countdown counts to the race itself, which is the one session time this row actually carries -
 * there is no per-session (qualifying/sprint) start time on a race row to count to, so none is
 * claimed. */
function RaceWeekend({ race }: { race: NextRace }) {
  const now = useMinuteClock();
  const raceAt = race?.raceDate ? parseUtcDateTime(race.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const flag = countryFlag(race?.country);

  return (
    <div className="relative">
      {race?.photoUrl && (
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <Image src={race.photoUrl} alt="" fill sizes="320px" className="object-cover opacity-45" />
          {/* Scrim, so the type on top keeps real contrast against whatever the photo happens to
              be - not a decorative gradient for its own sake. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/75 to-[var(--f1-carbon)]" />
        </div>
      )}

      <div className="relative px-4 pb-4 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90">Race weekend</p>

        {!race ? (
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">No upcoming race is scheduled yet.</p>
        ) : (
          <>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Round {race.round}</p>
            <h2 className="mt-1 flex items-start gap-2 text-[17px] font-bold leading-tight tracking-[-0.01em] text-white">
              {flag && (
                <span aria-hidden className="shrink-0 text-base leading-tight">
                  {flag}
                </span>
              )}
              <span className="min-w-0">{race.name}</span>
            </h2>
            {race.raceDate && (
              <p className="mt-1 text-xs text-neutral-400">
                {new Date(race.raceDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}

            {countdown && (
              <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/[0.12] px-2.5 py-1 text-[11px] font-semibold text-[var(--f1-red)]">
                <ClockIcon />
                Lights out in {countdown}
              </p>
            )}

            <Link
              href={raceHref(race.year, race.round, race.name)}
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-[13px] font-medium text-neutral-100 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
            >
              <CalendarIcon />
              View race
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/** Real closing signal, not a fabricated "closing soon" badge - the same raceDate each row already
 * carries, through the exact countdown utility PredictionCard itself uses, ticked off the shared
 * per-minute clock rather than a second interval. */
function ActivePredictions({ predictions }: { predictions: FeedPrediction[] }) {
  const now = useMinuteClock();

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Active predictions</p>
      {predictions.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-neutral-600">No active predictions. New rounds open as a race weekend approaches.</p>
      ) : (
        <div className="-mx-2 mt-1.5">
          {predictions.map((p) => {
            const raceAt = p.raceDate ? parseUtcDateTime(p.raceDate).getTime() : null;
            const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
            return (
              // Deep-links straight to that community's Predictions tab - CommunityTabs puts the
              // active tab in ?tab=, so there is a real target to link to.
              <Link key={p.id} href={`${groupHref(p.groupId)}?tab=predictions`} className="group flex items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-white/[0.04]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-white">{p.raceName}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                    {predictionTypeLabels[p.type]} · {p.groupName}
                    {countdown && <span className="text-neutral-600"> · closes in {countdown}</span>}
                  </span>
                </span>
                {p.hasEntered ? (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">Entered</span>
                ) : (
                  <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-neutral-300">{p.entryPoints} pts</span>
                )}
                <span className="shrink-0 text-neutral-700 transition group-hover:text-neutral-300">
                  <ChevronIcon />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.2V7l1.9 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <rect x="2.2" y="3.4" width="11.6" height="10.4" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.2 6.6h11.6M5.5 2v2.6M10.5 2v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13 7-1.8 4.4a1 1 0 0 1-.6.6L6.5 13.5l1.8-4.4a1 1 0 0 1 .6-.6L13 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
