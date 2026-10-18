"use client";

import Link from "next/link";
import { ChevronRight, Flag } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { ensureVisible } from "@/lib/colorContrast";
import { teamColor } from "@/lib/teamColors";
import { timeAgo } from "@/lib/format";
import { raceHref } from "@/lib/routes";
import { sessionEndsAt, type CommunitySession, type ResultLine } from "@/lib/communityWeekend";
import type { CalledIt } from "@/lib/supabase/communityWeekend";
import { EYEBROW, PANEL } from "../panel";

/**
 * A session's result, dropped into the feed where the session ended: the top three as the site shows drivers (team
 * bar, code, name) with the lap time or gap, and, where your communities ran a settled round on it, how many of their
 * entries called it. It's the feed's own record of the weekend, between the posts written around it.
 */
export function SessionResultCard({
  session,
  lines,
  calledIt,
  audience = "in your communities",
  race,
}: {
  session: CommunitySession;
  lines: ResultLine[];
  calledIt?: CalledIt;
  /** Whose entries `calledIt` counts, as it reads after the figure: "in your communities", or "here" on one community's page. */
  audience?: string;
  race: { year: number; round: number; name: string };
}) {
  const endedAt = new Date(sessionEndsAt(session)).toISOString();
  const share = calledIt ? Math.round((calledIt.correct / calledIt.total) * 100) : null;
  return (
    <article className={`p-4 ${PANEL}`} aria-label={`${session.label} result`}>
      <div className="flex items-center gap-2">
        <Icon icon={Flag} size={16} className="size-3.5 text-tertiary" />
        <h3 className={EYEBROW}>{session.label} · result</h3>
        <span suppressHydrationWarning className="ml-auto text-caption text-tertiary">
          {timeAgo(endedAt)}
        </span>
      </div>
      <ol className="mt-3 space-y-1">
        {lines.map((l) => (
          <li key={l.code} className="flex h-8 items-center gap-2.5 text-body-sm">
            <span className="w-4 shrink-0 text-right text-caption font-semibold tabular text-tertiary">{l.position}</span>
            <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: l.team ? ensureVisible(teamColor(l.team)) : "transparent" }} />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-primary">{l.code}</span>
              <span className="ml-1.5 text-secondary">{l.name}</span>
            </span>
            {l.detail && <span className="shrink-0 text-caption tabular text-secondary">{l.detail}</span>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-3">
        {calledIt && share !== null ? (
          <p className="min-w-0 flex-1 text-caption text-secondary">
            <span className="font-semibold tabular text-primary">
              {calledIt.correct} of {calledIt.total}
            </span>{" "}
            {audience} {calledIt.label}
            <span className="ml-2 inline-block h-1 w-16 overflow-hidden rounded-full bg-white/[0.08] align-middle">
              <span className="block h-full rounded-full bg-success" style={{ width: `${share}%` }} />
            </span>
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <Link href={raceHref(race.year, race.round, race.name)} className="flex shrink-0 items-center gap-0.5 rounded-control text-caption text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          Full results
          <Icon icon={ChevronRight} size={16} className="size-3.5" />
        </Link>
      </div>
    </article>
  );
}
