"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { raceHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";
import type { RaceSummary } from "../_service/season.pure";

type Leader = { name: string; team: string; points: number; gap: number | null; changed: boolean };
const REPLAY_STEP_MS = 520;
const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Who led the championship after each round, from the rounds' own results (Grand Prix points, as the standings). */
function leadersByRound(rounds: RaceSummary[]): (Leader | null)[] {
  const totals = new Map<string, { name: string; team: string; points: number }>();
  let previous: string | null = null;
  return rounds.map((r) => {
    if (r.state !== "completed") return null;
    for (const res of r.results) {
      const t = totals.get(res.driver) ?? { name: res.driverName, team: res.team, points: 0 };
      t.points += res.points;
      t.team = res.team;
      totals.set(res.driver, t);
    }
    const [first, second] = [...totals.entries()].sort((a, b) => b[1].points - a[1].points);
    if (!first) return null;
    const changed = previous !== null && previous !== first[0];
    previous = first[0];
    return { ...first[1], gap: second ? first[1].points - second[1].points : null, changed };
  });
}

/**
 * The season as a track you can scrub (in place of a points ticker). On load the track fills from round 1 in each
 * winner's team colour and the car drives to where the season is now. Hover, drag or use the arrow keys to read any
 * round: its winner and podium and who led the championship after it, or its date and countdown. Replay drives the
 * car from round 1 and shows the lead changing hands. A round opens its race on click or Enter.
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

  const [mounted, setMounted] = useState(false); // drives the fill sweep and the car's first drive
  const [hover, setHover] = useState<number | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // The user's motion preference, hydration-safe (the server renders "no preference") and live if it changes.
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED).matches, () => false);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  // Replay: one round per step up to the current round, then the card stays on the final lead for a moment.
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
  const showCard = replay !== null || hover !== null;
  const carIdx = mounted ? active : 0;

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
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setReplay(null);
      setHover(e.key === "Home" ? 0 : e.key === "End" ? n - 1 : Math.min(n - 1, Math.max(0, at + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Enter") {
      const r = rounds[at];
      router.push(raceHref(year, r.round, r.name));
    } else if (e.key === "Escape") setHover(null);
  };

  const r = rounds[active];
  const leader = leaders[active];
  const winner = r.podium.find((p) => p.position === 1);
  const cancelled = r.weekendStatus === "cancelled";
  const live = r.weekendStatus === "live";
  const date = r.raceDate ? new Date(`${r.raceDate.slice(0, 10)}T12:00:00Z`) : null;
  const days = date ? Math.round((date.getTime() - now) / 86400000) : null;
  const state = cancelled ? "Cancelled" : r.state === "completed" ? (r.results.length ? "Result" : "Result not in yet") : live ? "Live this weekend" : r.state === "next" ? "Next" : "Upcoming";
  const label = `Round ${r.round}, ${r.name}. ${cancelled ? "Cancelled." : winner ? `Won by ${winner.driverName}.` : state + "."}${leader ? ` ${leader.name} led the championship by ${leader.gap ?? 0} points.` : ""}`;
  const pct = ((carIdx + 0.5) / n) * 100;
  const cardLeft = Math.min(84, Math.max(16, ((active + 0.5) / n) * 100));
  const homeRound = rounds[homeIdx];

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex items-center gap-3">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={`${year} season, round by round`}
          aria-valuemin={1}
          aria-valuemax={n}
          aria-valuenow={r.round}
          aria-valuetext={label}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const i = indexAt(e.clientX);
            router.push(raceHref(year, rounds[i].round, rounds[i].name));
          }}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          className="scrubber relative min-w-0 flex-1 cursor-pointer touch-none rounded-control py-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
        >
          <div className="flex gap-[3px]">
            {rounds.map((round, i) => {
              const w = round.podium.find((p) => p.position === 1);
              const done = round.state === "completed";
              return (
                <span key={round.round} aria-hidden className={`relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08] ${round.weekendStatus === "cancelled" ? "round-pip-cancelled" : ""}`}>
                  {done && (
                    <span
                      className="absolute inset-0 origin-left rounded-full transition-transform ease-out"
                      style={{ backgroundColor: w ? teamColor(w.team) : "var(--text-secondary)", transform: mounted || reduced ? "scaleX(1)" : "scaleX(0)", transitionDuration: reduced ? "0ms" : "420ms", transitionDelay: reduced ? "0ms" : `${i * 45}ms` }}
                    />
                  )}
                  {i === active && showCard && <span className="absolute inset-0 rounded-full ring-1 ring-white/70" />}
                </span>
              );
            })}
          </div>
          {/* The car: glides to the current round on load, follows the hover and the replay. */}
          <span
            aria-hidden
            className={`scrubber-car pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${homeRound.weekendStatus === "live" && active === homeIdx ? "scrubber-car-live" : ""}`}
            style={{ left: `${pct}%`, transition: reduced ? "none" : `left ${hover !== null ? 140 : replay !== null ? REPLAY_STEP_MS - 60 : 1200 + homeIdx * 20}ms cubic-bezier(0.2, 0, 0, 1)` }}
          />
        </div>
        <button
          type="button"
          onClick={() => (replay === null ? (setHover(null), setReplay(0)) : setReplay(null))}
          aria-label={replay === null ? "Replay the season" : "Stop the replay"}
          title={replay === null ? "Replay the season" : "Stop"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-subtle text-secondary transition-colors duration-fast hover:border-strong hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Icon icon={replay === null ? Play : Pause} size={16} />
        </button>
      </div>

      {/* The round under the car: a small card while you scrub or replay, the current round's line otherwise. */}
      {showCard ? (
        <div className="pointer-events-none absolute top-full z-popover mt-1 w-72 -translate-x-1/2 rounded-card bg-surface-3/95 p-4 shadow-overlay backdrop-blur" style={{ left: `${cardLeft}%` }} aria-hidden>
          <div className="flex items-center justify-between gap-2 text-caption">
            <span className="tabular text-secondary">
              R{r.round}
              {date ? ` · ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
            </span>
            <span className={live ? "text-brand-text" : "text-secondary"}>{state}</span>
          </div>
          <p className={`mt-1 truncate text-body font-semibold ${cancelled ? "text-secondary line-through" : "text-primary"}`}>{r.name}</p>
          {r.state === "completed" && r.podium.length > 0 && (
            <ol className="mt-2 space-y-1">
              {r.podium.slice(0, 3).map((p) => (
                <li key={p.driver} className="flex items-center gap-2 text-body-sm">
                  <span className="w-4 tabular text-tertiary">{p.position}</span>
                  <span className="h-3.5 w-1 rounded-full" style={{ backgroundColor: teamColor(p.team) }} />
                  <span className="truncate text-primary">{p.driverName}</span>
                </li>
              ))}
            </ol>
          )}
          {leader && (
            <p className={`mt-3 border-t border-subtle pt-2 text-caption ${leader.changed ? "text-brand-text" : "text-secondary"}`}>
              {leader.changed ? "New leader: " : "Leader: "}
              <span className="font-semibold text-primary">{leader.name}</span>, {leader.points} pts{leader.gap !== null ? ` (+${leader.gap})` : ""}
            </p>
          )}
          {r.state !== "completed" && !cancelled && days !== null && (
            <p className="mt-2 text-body-sm text-secondary">{days <= 0 ? "This weekend" : `In ${days} ${days === 1 ? "day" : "days"}`}</p>
          )}
        </div>
      ) : (
        <p className="mt-1 text-caption text-tertiary">
          {homeRound.state === "completed" ? "Season complete" : homeRound.weekendStatus === "live" ? <span className="text-brand-text">Live now: {homeRound.name}</span> : `Next: ${homeRound.name}`}
          <span className="hidden sm:inline"> · hover or use ← → to explore, ▶ to replay</span>
        </p>
      )}
    </div>
  );
}
