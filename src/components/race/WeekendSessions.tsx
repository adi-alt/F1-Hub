"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { TabList, TabPanels, Tabs } from "@/components/ui/Tabs";
import { PracticeSummary } from "@/components/race/PracticeSummary";
import { QualifyingStages } from "@/components/race/QualifyingStages";
import { RaceClassification } from "@/components/race/RaceClassification";
import type { QualifyingStageRow } from "@/lib/supabase/races";
import type { RaceDoc } from "@/lib/types/race";
import type { SessionKey, WeekendSession } from "@/lib/weekendSessions";
import { formatTrackTime } from "@/lib/circuitTimeZones";

// Charts load on their own, after the page (audit R-70, PERF-02): recharts stays out of the first bundle.
const QualifyingGapChart = dynamic(() => import("@/components/race/QualifyingGapChart").then((m) => m.QualifyingGapChart), { ssr: false, loading: () => <div className="skeleton-shimmer h-64 w-full rounded-card bg-surface-2" /> });

/**
 * The weekend, session by session, as the calendar lists it: a standard weekend's three practices, qualifying and
 * the Grand Prix, or a sprint weekend's one practice, sprint qualifying, sprint, qualifying and Grand Prix - only the
 * sessions this event actually has. It opens on the most recent session with results (see defaultSession), so after
 * qualifying the page leads with qualifying. A session without results says why: still to come, under way, or run
 * with its results not in yet.
 */
export function WeekendSessions({ race, sessions, initial, stages }: { race: RaceDoc; sessions: WeekendSession[]; initial: SessionKey | null; stages: QualifyingStageRow[] }) {
  const [key, setKey] = useState<SessionKey | null>(initial);
  if (sessions.length === 0 || !key) return null;
  const current = sessions.find((s) => s.key === key) ?? sessions[0];
  const roster = [...(race.inputs ?? []), ...(race.results ?? [])];
  const grid = race.status === "completed" && race.results ? new Map(race.results.map((r) => [r.driver, r.grid])) : undefined;

  const panel = () => {
    if (current.state !== "completed") return <NotYet session={current} circuit={race.circuit} />;
    switch (current.key) {
      case "FP1":
      case "FP2":
      case "FP3":
        return race.practice?.[current.key] ? <PracticeSummary practice={{ [current.key]: race.practice[current.key] }} roster={roster} /> : <NotYet session={current} circuit={race.circuit} />;
      case "SQ":
      case "Q": {
        const rows = stages.filter((r) => r.session === current.key);
        if (rows.length) return <QualifyingStages rows={rows} session={current.key} grid={current.key === "Q" ? grid : undefined} />;
        // Rounds stored before stage-by-stage qualifying: the order and gap to pole we had.
        return current.key === "Q" && race.inputs?.length ? <QualifyingGapChart inputs={race.inputs} driverSet="all" customIds={[]} /> : <NotYet session={current} circuit={race.circuit} />;
      }
      case "S":
        return (
          <RaceClassification
            results={(race.sprintResults ?? []).map((r) => ({ ...r, fastestLapSec: null }))}
            preliminary={race.sprintSource === "openf1_preliminary"}
          />
        );
      case "R": {
        const winner = race.results?.find((r) => r.finishPosition === 1);
        return (
          <p className="text-body-sm text-secondary">
            {winner ? `${winner.driverName} won. ` : ""}
            The full classification is in{" "}
            <a href="#results" className="text-primary underline-offset-4 hover:underline">
              the result above
            </a>
            .
          </p>
        );
      }
    }
  };

  return (
    <Tabs variant="underline" value={current.key} onValueChange={(v) => setKey(v as SessionKey)} items={sessions.map((s) => ({ value: s.key, label: s.label }))}>
      <TabList aria-label="Weekend sessions" className="mb-5" />
      <TabPanels>{panel()}</TabPanels>
    </Tabs>
  );
}

function NotYet({ session, circuit }: { session: WeekendSession; circuit: string }) {
  const when = session.startsAt
    ? new Date(session.startsAt.endsWith("Z") ? session.startsAt : `${session.startsAt}Z`).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  const track = session.startsAt ? formatTrackTime(session.startsAt, circuit) : null;
  const text =
    session.state === "live"
      ? `${session.label} is under way. Its results appear here once the session ends and the timing data is published.`
      : session.state === "awaiting"
        ? `${session.label} has finished. Its results appear here as soon as they're published.`
        : `${session.label}${when ? ` starts ${when} (your time)${track ? `, ${track} at the track` : ""}` : " hasn't run yet"}.`;
  return <p suppressHydrationWarning className="text-body-sm text-secondary">{text}</p>;
}
