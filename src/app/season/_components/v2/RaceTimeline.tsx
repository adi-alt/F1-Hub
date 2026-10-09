"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CheckCircle2, CircleDot, Clock, Radio, XCircle } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { Section } from "@/components/ui/Section";
import { raceHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";
import type { RaceSummary } from "../../_service/season.pure";

const STATUS = {
  completed: { label: "Completed", icon: CheckCircle2, cls: "text-secondary" },
  live: { label: "This weekend", icon: Radio, cls: "text-brand-text" },
  next: { label: "Next", icon: CircleDot, cls: "text-primary" },
  upcoming: { label: "Upcoming", icon: Clock, cls: "text-tertiary" },
  cancelled: { label: "Cancelled", icon: XCircle, cls: "text-tertiary" },
} as const;

function statusOf(r: RaceSummary): keyof typeof STATUS {
  if (r.weekendStatus === "cancelled") return "cancelled";
  if (r.state === "completed") return "completed";
  if (r.weekendStatus === "live") return "live";
  if (r.state === "next") return "next";
  return "upcoming";
}

/**
 * The season as a timeline of race cards: round, Grand Prix, date and state (an icon and a word, never colour
 * alone), the winner and their team for a completed round, a sprint marker, and whether the result is in. Each
 * card opens its race. Scrolls sideways; on load it brings the current round into view.
 */
export function RaceTimeline({ year, raceSummaries }: { year: number; raceSummaries: RaceSummary[] }) {
  const rail = useRef<HTMLOListElement>(null);
  const rounds = [...raceSummaries].sort((a, b) => a.round - b.round);
  const focusRound = rounds.find((r) => r.state === "next")?.round ?? rounds.at(-1)?.round;

  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>(`[data-round="${focusRound}"]`);
    if (el && rail.current) rail.current.scrollLeft = Math.max(0, el.offsetLeft - rail.current.clientWidth / 3);
  }, [focusRound]);

  return (
    <Section id="season-timeline" level={2} title="Race by race" description="Every round of the season. Open one for its full race page.">
      <ol ref={rail} className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3" aria-label={`${year} rounds`}>
        {rounds.map((r) => {
          const st = STATUS[statusOf(r)];
          const winner = r.podium.find((p) => p.position === 1);
          const date = r.raceDate ? new Date(`${r.raceDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null;
          const current = statusOf(r) === "next" || statusOf(r) === "live";
          return (
            <li key={r.round} data-round={r.round} className="w-60 shrink-0 snap-start">
              <Link
                href={raceHref(year, r.round, r.name)}
                className={`flex h-full flex-col rounded-card p-4 transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${current ? "bg-surface-2 ring-1 ring-brand/60" : "bg-surface-1 hover:bg-surface-2"} ${statusOf(r) === "cancelled" ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2 text-caption">
                  <span className="tabular text-secondary">
                    R{r.round}
                    {date ? ` · ${date}` : ""}
                  </span>
                  <span className={`flex items-center gap-1 ${st.cls}`}>
                    <Icon icon={st.icon} size={16} />
                    {st.label}
                  </span>
                </div>
                <p className={`mt-2 line-clamp-2 text-body font-semibold ${statusOf(r) === "cancelled" ? "text-secondary line-through" : "text-primary"}`}>{r.name}</p>
                <p className="truncate text-caption text-tertiary">{r.circuit ?? r.trackShort}</p>
                <div className="mt-auto pt-4">
                  {winner ? (
                    <p className="flex items-center gap-2 text-body-sm">
                      <span aria-hidden className="h-4 w-1 rounded-full" style={{ backgroundColor: teamColor(winner.team) }} />
                      <span className="min-w-0 truncate text-primary">
                        {winner.driverName}
                        <span className="text-secondary"> · {winner.team}</span>
                      </span>
                    </p>
                  ) : statusOf(r) === "completed" ? (
                    <p className="text-caption text-tertiary">Result not in yet</p>
                  ) : (
                    <p className="text-caption text-tertiary">{statusOf(r) === "cancelled" ? "Not run" : "Not run yet"}</p>
                  )}
                  {r.isSprintWeekend && <p className="mt-2 inline-block rounded-control bg-white/[0.06] px-1.5 py-0.5 text-caption text-secondary">Sprint weekend</p>}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
