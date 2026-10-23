"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ChevronRight, X } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatCountdown, formatLocalTime, formatLocalWeekday, parseUtcDateTime } from "@/lib/countdown";
import { liveSession, sessionEndsAt, type SessionKey } from "@/lib/communityWeekend";
import { shortRaceName } from "@/lib/headerSchedule";
import type { CommunityWeekendData } from "@/lib/supabase/communityWeekend";
import { EYEBROW, PANEL } from "../panel";

const SHORT: Record<SessionKey, string> = { FP1: "FP1", FP2: "FP2", FP3: "FP3", SQ: "Sprint quali", S: "Sprint", Q: "Qualifying", R: "Race" };

/**
 * The race weekend, at the top of the feed: its sessions on one line (done, live, next, still to come, in the viewer's
 * own time), and what's happening now. Each session is also a filter: choosing one narrows the feed to what was said
 * during and after it, with its result; choosing it again (or Clear) shows everything. The selection slides between
 * sessions (motion's layoutId).
 */
export function WeekendBar({
  weekend,
  selected,
  onSelect,
  openRounds = 0,
  roundsHref,
}: {
  weekend: NonNullable<CommunityWeekendData>;
  selected: SessionKey | null;
  onSelect: (key: SessionKey | null) => void;
  /** Open prediction rounds, linked from the bar below xl, where the race rail isn't shown. */
  openRounds?: number;
  roundsHref?: string;
}) {
  const now = useMinuteClock();
  const tz = useViewerTimeZone();
  const sessions = weekend.sessions;
  const live = liveSession(sessions, now);
  const nextIndex = sessions.findIndex((s) => parseUtcDateTime(s.startsAt).getTime() > now);
  const next = nextIndex >= 0 ? sessions[nextIndex] : null;
  const over = !live && !next;

  return (
    <section aria-label={`${weekend.raceName} weekend`} className={`px-4 pb-2 pt-3 ${PANEL}`}>
      {/* On a phone the name takes its own line and the status wraps beneath it, rather than truncating the name. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className={`w-full min-w-0 truncate sm:w-auto ${EYEBROW}`}>{shortRaceName(weekend.raceName)} · race weekend</h2>
        <p suppressHydrationWarning className="flex shrink-0 items-center gap-1.5 text-caption tabular sm:ml-auto">
          {live ? (
            <>
              <span aria-hidden className="size-1.5 rounded-full bg-brand motion-safe:animate-pulse" />
              <span className="font-semibold text-primary">Live · {live.label}</span>
            </>
          ) : next ? (
            <span className="text-secondary">
              {SHORT[next.key]} in <span className="font-medium text-primary">{formatCountdown(parseUtcDateTime(next.startsAt).getTime(), now)}</span>
            </span>
          ) : (
            <span className="text-secondary">Weekend over</span>
          )}
        </p>
        {openRounds > 0 && roundsHref && (
          <Link href={roundsHref} className="ml-auto flex shrink-0 items-center gap-0.5 rounded-control text-caption text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:ml-0 xl:hidden">
            {openRounds} open round{openRounds === 1 ? "" : "s"}
            <Icon icon={ChevronRight} size={16} className="size-3.5" />
          </Link>
        )}
      </div>

      <div tabIndex={0} role="region" aria-label="Sessions" className="-mx-1 mt-2 overflow-x-auto px-1 scrollbar-hide focus-visible:outline-2 focus-visible:outline-focus-ring">
        <ol className="relative grid min-w-[30rem] auto-cols-fr grid-flow-col" aria-label="Sessions: choose one to see what was said during and after it">
          <span aria-hidden className="absolute inset-x-6 top-[15px] h-px bg-white/10" />
          {sessions.map((s, i) => {
            const startsAt = parseUtcDateTime(s.startsAt).getTime();
            const isLive = live?.key === s.key;
            const done = !isLive && now >= sessionEndsAt(s);
            const isNext = i === nextIndex && !live;
            const isSelected = selected === s.key;
            // A session still to start has nothing said about it yet, so it isn't a filter.
            const canFilter = now >= startsAt;
            return (
              <li key={s.key} className="relative">
                <button
                  type="button"
                  disabled={!canFilter}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(isSelected ? null : s.key)}
                  className="group relative flex w-full flex-col items-center rounded-control px-1 pb-2 pt-2 text-center transition-colors duration-fast enabled:hover:bg-white/[0.03] disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <span
                    aria-hidden
                    className={`relative z-10 size-3 rounded-full border-2 ${isLive ? "border-brand bg-brand motion-safe:animate-pulse" : done ? "border-primary bg-primary" : isNext ? "border-primary bg-surface-0" : "border-white/25 bg-surface-0"}`}
                  />
                  <span className={`mt-1.5 text-caption font-medium ${isSelected || isLive || isNext ? "text-primary" : done ? "text-secondary group-enabled:group-hover:text-primary" : "text-tertiary"}`}>{SHORT[s.key]}</span>
                  <span suppressHydrationWarning className="text-caption tabular text-tertiary">
                    {isLive ? "Live now" : `${formatLocalWeekday(s.startsAt, tz)} ${formatLocalTime(s.startsAt, tz, false)}`}
                  </span>
                  {isSelected && <motion.span aria-hidden layoutId="weekend-selected" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {selected && (
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-caption text-secondary">
          <span>
            Showing what was said during and after <span className="font-medium text-primary">{sessions.find((s) => s.key === selected)?.label}</span>
          </span>
          <button type="button" onClick={() => onSelect(null)} className="flex shrink-0 items-center gap-1 rounded-control font-medium text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            <Icon icon={X} size={16} className="size-3.5" />
            Clear
          </button>
        </div>
      )}
      {over && !selected && <p className="pb-1 text-caption text-tertiary">Choose a session to relive what was said during and after it.</p>}
    </section>
  );
}
