"use client";

import Link from "next/link";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { raceHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";
import type { DriverStandingRow, RaceSummary } from "../../_service/season.pure";

/**
 * The season at a glance (a compact masthead, not a leaderboard): the year and its state, the leader and the
 * margin, the next Grand Prix, and the season as a strip of rounds where each completed round carries its
 * winner's team colour. Cancelled rounds are hatched and labelled, not just coloured.
 */
export function SeasonOverview({ year, status, raceSummaries, drivers, backHref }: { year: number; status: "ongoing" | "completed"; raceSummaries: RaceSummary[]; drivers: DriverStandingRow[]; backHref?: string }) {
  const now = useMinuteClock();
  const rounds = [...raceSummaries].sort((a, b) => a.round - b.round);
  const done = rounds.filter((r) => r.state === "completed").length;
  const scheduled = rounds.filter((r) => r.weekendStatus !== "cancelled").length;
  const next = rounds.find((r) => r.state === "next") ?? null;
  const [leader, second] = drivers;
  const daysToNext = next?.raceDate ? Math.max(0, Math.round((new Date(`${next.raceDate.slice(0, 10)}T12:00:00Z`).getTime() - now) / 86400000)) : null;

  return (
    <header className="mb-12">
      {backHref && (
        <Link href={backHref} className="mb-3 inline-block rounded-control text-caption text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          ← Archive
        </Link>
      )}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="text-body-sm text-secondary">
            Formula 1 · {status === "ongoing" ? "Season in progress" : "Season complete"}
          </p>
          <h1 className="mt-1 text-display-lg text-primary sm:text-display-xl">{year} championship</h1>
          {leader && (
            <p className="mt-3 max-w-2xl text-body text-secondary">
              <span className="font-semibold text-primary">{leader.driverName}</span> {status === "ongoing" ? "leads" : "won"}
              {second ? (
                <>
                  {" "}by <span className="font-semibold tabular text-primary">{leader.points - second.points} points</span> from {second.driverName}
                </>
              ) : null}
              , after {done} of {scheduled} rounds.
            </p>
          )}
        </div>
        {next && (
          <Link
            href={raceHref(year, next.round, next.name)}
            className="group min-w-0 rounded-card bg-surface-1 px-5 py-4 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:min-w-72"
          >
            <p className="text-caption text-secondary">
              Next · Round {next.round}
              {next.isSprintWeekend ? " · Sprint weekend" : ""}
            </p>
            <p className="mt-1 truncate text-title-md text-primary">{next.name}</p>
            <p className="mt-1 text-body-sm tabular text-secondary">
              {next.circuit ?? next.trackShort}
              {daysToNext !== null ? ` · ${daysToNext === 0 ? "this weekend" : `in ${daysToNext} ${daysToNext === 1 ? "day" : "days"}`}` : ""}
            </p>
          </Link>
        )}
      </div>

      {/* The season as rounds: winner's team colour for each completed round, an outlined next round, dim future
          ones. Each is a link to its race, with its result in the label. */}
      <nav aria-label={`${year} rounds`} className="mt-8">
        <ol className="flex gap-1">
          {rounds.map((r) => {
            const winner = r.podium.find((p) => p.position === 1);
            const cancelled = r.weekendStatus === "cancelled";
            const state = cancelled ? "cancelled" : r.state === "completed" ? "done" : r.state === "next" ? "next" : "todo";
            const label = `Round ${r.round}, ${r.name}: ${cancelled ? "cancelled" : state === "done" ? (winner ? `won by ${winner.driverName} (${winner.team})` : "completed") : state === "next" ? "next race" : "upcoming"}`;
            return (
              <li key={r.round} className="min-w-0 flex-1">
                <Link href={raceHref(year, r.round, r.name)} aria-label={label} title={label} className="group block rounded-control py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                  <span
                    aria-hidden
                    className={`round-pip block h-2 rounded-full transition-transform duration-fast group-hover:scale-y-150 ${state === "next" ? "round-pip-next" : ""} ${cancelled ? "round-pip-cancelled" : ""}`}
                    style={{ backgroundColor: state === "done" ? (winner ? teamColor(winner.team) : "var(--text-secondary)") : state === "next" ? "transparent" : "rgb(255 255 255 / 0.12)" }}
                  />
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="mt-1.5 flex justify-between text-caption tabular text-tertiary">
          <span>R1</span>
          <span className="text-secondary">
            {done} of {scheduled} rounds complete
          </span>
          <span>R{rounds.at(-1)?.round ?? ""}</span>
        </div>
      </nav>
    </header>
  );
}
