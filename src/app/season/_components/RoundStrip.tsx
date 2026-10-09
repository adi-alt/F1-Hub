"use client";

import Link from "next/link";
import { raceHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";
import type { RaceSummary } from "../_service/season.pure";

/**
 * The season as its rounds, in place of a points ticker: one marker per round, a completed round in its winner's
 * team colour, the next round outlined (and pulsing, unless reduced motion), a cancelled round hatched, the rest dim.
 * Each marker links to its race, and its label says the result, so the state never rests on colour alone.
 */
export function RoundStrip({ year, raceSummaries }: { year: number; raceSummaries: RaceSummary[] }) {
  const rounds = [...raceSummaries].sort((a, b) => a.round - b.round);
  return (
    <nav aria-label={`${year} rounds`} className="min-w-0 flex-1">
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
                  className={`block h-1.5 rounded-full transition-transform duration-fast group-hover:scale-y-150 ${state === "next" ? "round-pip-next" : ""} ${cancelled ? "round-pip-cancelled" : ""}`}
                  style={{ backgroundColor: state === "done" ? (winner ? teamColor(winner.team) : "var(--text-secondary)") : state === "next" ? "transparent" : "rgb(255 255 255 / 0.12)" }}
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
