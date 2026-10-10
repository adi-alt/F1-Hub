"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { raceHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";
import type { RaceSummary } from "../_service/season.pure";

type Leader = { name: string; points: number; gap: number | null; changed: boolean };
const REPLAY_STEP_MS = 520;
const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Who led the championship after each round, from the rounds' own results (Grand Prix points, as the standings). */
function leadersByRound(rounds: RaceSummary[]): (Leader | null)[] {
  const totals = new Map<string, { name: string; points: number }>();
  let previous: string | null = null;
  return rounds.map((r) => {
    if (r.state !== "completed") return null;
    for (const res of r.results) {
      const t = totals.get(res.driver) ?? { name: res.driverName, points: 0 };
      t.points += res.points;
      totals.set(res.driver, t);
    }
    const [first, second] = [...totals.entries()].sort((a, b) => b[1].points - a[1].points);
    if (!first) return null;
    const changed = previous !== null && previous !== first[0];
    previous = first[0];
    return { ...first[1], gap: second ? first[1].points - second[1].points : null, changed };
  });
}

/** "Australian Grand Prix" -> "AUS", "São Paulo Grand Prix" -> "SAO". A display label only, never an identifier. */
export function shortLabel(r: Pick<RaceSummary, "trackShort" | "name">): string {
  const base = (r.trackShort || r.name.replace(/ Grand Prix$/, "")).normalize("NFD").replace(/[̀-ͯ]/g, "");
  return base.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

type Kind = "done" | "active" | "upcoming" | "cancelled";

/**
 * The season as a broadcast-style timeline: one hairline baseline, a milestone per round, the run part of the line
 * drawn brighter, and the round in focus marked in the brand red by a short indicator that slides between rounds.
 * Round numbers sit under the milestones and three-letter event codes above them where the width allows (fewer on
 * narrow screens; never wider than its column). Milestone shape and text weight carry the state, not colour alone:
 * a solid square for a completed round, a hollow ring for one to come, a cross for a cancelled one, a red ring for
 * the current one. Hover, focus or the arrow keys show a round's details; Enter or a click opens the race; replay
 * steps from round 1 through the lead changing hands. Built only from the season's race summaries, so any year, a
 * partial calendar, cancelled rounds and missing results all work.
 */
export function SeasonScrubber({ year, raceSummaries }: { year: number; raceSummaries: RaceSummary[] }) {
  const router = useRouter();
  const now = useMinuteClock();
  const rounds = useMemo(() => [...raceSummaries].sort((a, b) => a.round - b.round), [raceSummaries]);
  const leaders = useMemo(() => leadersByRound(rounds), [rounds]);
  const n = rounds.length;
  const nextIdx = rounds.findIndex((r) => r.state === "next");
  const lastDone = rounds.reduce((acc, r, i) => (r.state === "completed" ? i : acc), -1);
  const homeIdx = nextIdx >= 0 ? nextIdx : Math.max(0, lastDone);

  const [hover, setHover] = useState<number | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED).matches, () => false);

  // Labels follow the space each round actually gets.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (replay === null) return;
    if (replay >= homeIdx) {
      const t = window.setTimeout(() => setReplay(null), 1800);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setReplay((i) => (i === null ? null : i + 1)), REPLAY_STEP_MS);
    return () => window.clearTimeout(t);
  }, [replay, homeIdx]);

  if (n === 0) return null;
  const active = replay ?? hover ?? homeIdx;
  const showDetail = replay !== null || hover !== null;
  const per = width > 0 ? width / n : 0;
  const showCodes = per >= 34;
  const numberStep = per >= 22 ? 1 : per >= 12 ? 3 : 6;
  const x = (i: number) => `${((i + 0.5) / n) * 100}%`;
  const runEnd = lastDone >= 0 ? ((lastDone + 0.5) / n) * 100 : 0;
  const kindOf = (round: RaceSummary, i: number): Kind =>
    round.weekendStatus === "cancelled" ? "cancelled" : i === homeIdx && round.state !== "completed" ? "active" : round.state === "completed" ? "done" : "upcoming";

  const indexAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * n)));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (replay !== null) setReplay(null);
    setHover(indexAt(e.clientX));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = hover ?? homeIdx;
    if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      setReplay(null);
      setHover(e.key === "Home" ? 0 : e.key === "End" ? n - 1 : Math.min(n - 1, Math.max(0, at + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Enter") {
      const round = rounds[at];
      router.push(raceHref(year, round.round, round.name));
    } else if (e.key === "Escape") setHover(null);
  };

  const r = rounds[active];
  const leader = leaders[active];
  const winner = r.podium.find((p) => p.position === 1);
  const kind = kindOf(r, active);
  const live = r.weekendStatus === "live";
  const date = r.raceDate ? new Date(`${r.raceDate.slice(0, 10)}T12:00:00Z`) : null;
  const days = date ? Math.round((date.getTime() - now) / 86400000) : null;
  const status = kind === "cancelled" ? "Cancelled" : r.state === "completed" ? (r.results.length ? "Completed" : "Completed · result pending") : live ? "Live" : kind === "active" ? "Next" : "Upcoming";
  const valueText = `Round ${r.round}, ${r.name}, ${status}${date ? `, ${date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}` : ""}${winner ? `. Won by ${winner.driverName}` : ""}${leader ? `. ${leader.name} led the championship by ${leader.gap ?? 0} points` : ""}.`;
  const detailLeft = Math.min(82, Math.max(18, ((active + 0.5) / n) * 100));
  const slide = reduced ? "none" : "left 260ms cubic-bezier(0.2, 0, 0, 1)";
  const home = rounds[homeIdx];

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex items-center gap-4">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={`${year} season, round by round`}
          aria-valuemin={1}
          aria-valuemax={n}
          aria-valuenow={r.round}
          aria-valuetext={valueText}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const i = indexAt(e.clientX);
            router.push(raceHref(year, rounds[i].round, rounds[i].name));
          }}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          className="relative h-16 min-w-0 flex-1 cursor-pointer touch-none select-none rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
        >
          {showCodes && (
            <div aria-hidden className="absolute inset-x-0 top-0 h-4">
              {rounds.map((round, i) => {
                const k = kindOf(round, i);
                return (
                  <span
                    key={round.round}
                    className={`absolute -translate-x-1/2 text-caption tracking-wide transition-colors duration-fast ${i === active ? "font-semibold text-primary" : k === "cancelled" ? "text-tertiary line-through" : k === "done" ? "text-secondary" : "text-tertiary"}`}
                    style={{ left: x(i) }}
                  >
                    {shortLabel(round)}
                  </span>
                );
              })}
            </div>
          )}

          <div aria-hidden className="absolute inset-x-0 top-7 h-px bg-white/[0.12]" />
          <div aria-hidden className="absolute left-0 top-7 h-px bg-white/55" style={{ width: `${runEnd}%` }} />

          {rounds.map((round, i) => {
            const k = kindOf(round, i);
            return (
              <span key={round.round} aria-hidden className="absolute top-7 -translate-x-1/2 -translate-y-1/2" style={{ left: x(i) }}>
                {k === "done" && <span className="block size-1.5 bg-white/80" />}
                {k === "upcoming" && <span className="block size-2 rounded-full border border-white/35 bg-surface-0" />}
                {k === "cancelled" && <span className="block text-caption leading-none text-tertiary">×</span>}
                {k === "active" && <span className="block size-2.5 rounded-full border-2 border-brand bg-surface-0" />}
              </span>
            );
          })}

          <span aria-hidden className="absolute top-[18px] h-5 w-px bg-brand" style={{ left: x(active), transition: slide }} />

          <div aria-hidden className="absolute inset-x-0 top-10 h-4">
            {rounds.map((round, i) =>
              i === active || (((i % numberStep === 0 && (n - 1 - i) * per >= 24) || i === n - 1) && Math.abs(i - active) * per >= 24) ? (
                <span key={round.round} className={`absolute -translate-x-1/2 text-caption tabular ${i === active ? "font-semibold text-brand-text" : "text-tertiary"}`} style={{ left: x(i) }}>
                  {round.round}
                </span>
              ) : null,
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => (replay === null ? (setHover(null), setReplay(0)) : setReplay(null))}
          aria-label={replay === null ? "Replay the season round by round" : "Stop the replay"}
          title={replay === null ? "Replay the season" : "Stop"}
          className="flex size-8 shrink-0 items-center justify-center rounded-control border border-subtle text-secondary transition-colors duration-fast hover:border-strong hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Icon icon={replay === null ? Play : Pause} size={16} />
        </button>
      </div>

      {showDetail ? (
        <div aria-hidden className="pointer-events-none absolute top-full z-popover mt-1 w-72 -translate-x-1/2 rounded-card border border-subtle bg-surface-2 px-4 py-3 shadow-overlay" style={{ left: `${detailLeft}%` }}>
          <div className="flex items-baseline justify-between gap-3 text-caption">
            <span className="tabular text-secondary">
              Round {r.round}
              {date ? ` · ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
            </span>
            <span className={live ? "text-brand-text" : "text-secondary"}>{status}</span>
          </div>
          <p className={`mt-1 truncate text-body-sm font-semibold ${kind === "cancelled" ? "text-secondary line-through" : "text-primary"}`}>{r.name}</p>
          {r.state === "completed" && r.podium.length > 0 && (
            <ol className="mt-2 space-y-0.5">
              {r.podium.slice(0, 3).map((p) => (
                <li key={p.driver} className="flex items-center gap-2 text-caption">
                  <span className="w-3 tabular text-tertiary">{p.position}</span>
                  <span className="h-3 w-0.5" style={{ backgroundColor: teamColor(p.team) }} />
                  <span className="truncate text-primary">{p.driverName}</span>
                  <span className="truncate text-tertiary">{p.team}</span>
                </li>
              ))}
            </ol>
          )}
          {leader && (
            <p className="mt-2 border-t border-subtle pt-2 text-caption text-secondary">
              {leader.changed ? "Lead changed: " : "Championship leader: "}
              <span className="font-semibold text-primary">{leader.name}</span> · {leader.points} pts{leader.gap !== null ? `, +${leader.gap}` : ""}
            </p>
          )}
          {r.state !== "completed" && kind !== "cancelled" && days !== null && <p className="mt-1 text-caption text-secondary">{days <= 0 ? "This weekend" : `In ${days} ${days === 1 ? "day" : "days"}`}</p>}
        </div>
      ) : (
        <p className="mt-1 text-caption text-tertiary">
          <span className="text-secondary">{home.state === "completed" ? "Season complete" : home.weekendStatus === "live" ? `Live · Round ${home.round}, ${home.name}` : `Next · Round ${home.round}, ${home.name}`}</span>
          <span className="hidden sm:inline"> · Hover or use ← → for any round</span>
        </p>
      )}
    </div>
  );
}
