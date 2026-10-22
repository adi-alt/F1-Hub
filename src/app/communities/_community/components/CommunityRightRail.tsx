"use client";

import { ChevronRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown } from "@/lib/countdown";
import { compactCount } from "@/lib/format";
import { predictionStateAt, predictionTypeLabels, type GroupPrediction } from "@/lib/groupPredictionTypes";
import type { CrowdVsModel } from "@/lib/supabase/communityWeekend";
import type { PredictionTrend } from "@/lib/supabase/groupPredictions";
import type { GroupMember, LeaderboardRow } from "@/lib/supabase/groups";
import type { GroupPulse, GroupStats } from "@/lib/supabase/groupStats";
import type { NextRaceSummary } from "@/lib/supabase/nextRace";
import { ApexWidget } from "../../components/ApexWidget";
import { RaceWeekend } from "../../components/GroupsRightSidebar";
import { PredictionTrendBars } from "../../components/post/PredictionTrendBars";

/** One open round plus the aggregate that was fetched for it server-side, so the rail draws its
 * bars on first paint instead of firing a request per card after mount. */
export type RailPrediction = { prediction: GroupPrediction; trend: PredictionTrend | null };

export type RailTab = "predictions" | "leaderboard" | "members" | "about" | "feed" | "invite";

/** How many members the league table lists before "Full table". */
const TABLE_ROWS = 5;

/**
 * The community page's rail, as the Communities home draws its own: separate widgets on Season's glass, each with a
 * tracked eyebrow, in priority order - the race weekend, Apex on this community, the league table, the rounds open to
 * predict, and what changed since you were last here. The community's own figures (members, activity) sit in the
 * header, so the rail is about the weekend and the competition.
 *
 * Every widget is real or absent: the race and Apex only for a community about Formula 1 (the page never fetches a
 * race for any other), the league and rounds only where those modules are on, the crowd-vs-Apex line only once a
 * round has settled, and the visit digest as a diff only when there is a previous visit to diff against.
 */
export function CommunityRightRail({
  stats,
  pulse,
  race,
  predictions,
  leaderboard,
  members,
  myUserId,
  crowdVsModel,
  showRace,
  showPredictions,
  showLeaderboard,
  canInvite = false,
  onOpenTab,
}: {
  stats: GroupStats;
  pulse: GroupPulse;
  race: NextRaceSummary;
  predictions: RailPrediction[];
  leaderboard: LeaderboardRow[];
  /** For the table's photos: leaderboard rows carry names, the member list carries faces. */
  members: GroupMember[];
  myUserId: string;
  crowdVsModel: CrowdVsModel | null;
  showRace: boolean;
  showPredictions: boolean;
  showLeaderboard: boolean;
  /** Whether this viewer may invite: the People widget's button. */
  canInvite?: boolean;
  /** Switches the page's own tab rather than navigating: the rail sits beside the panel it points at. */
  onOpenTab: (tab: RailTab) => void;
}) {
  return (
    <div className="space-y-3">
      {showRace && (
        <div className={`overflow-hidden ${PANEL}`}>
          <RaceWeekend race={race} />
        </div>
      )}
      {showRace && (
        <div className={`p-4 ${PANEL}`}>
          <ApexWidget location={race?.circuit ?? null} year={race?.year ?? null} />
        </div>
      )}
      {showLeaderboard && leaderboard.length > 0 && (
        <div className={`p-4 ${PANEL}`}>
          <LeagueTable rows={leaderboard} members={members} myUserId={myUserId} crowdVsModel={crowdVsModel} onOpen={() => onOpenTab("leaderboard")} />
        </div>
      )}
      {showPredictions && (
        <div className={`p-4 ${PANEL}`}>
          <OpenRounds predictions={predictions} onOpen={() => onOpenTab("predictions")} />
        </div>
      )}
      {/* Without a league table (which already shows the faces), the rail shows who's here, and a way to ask more in. */}
      {!(showLeaderboard && leaderboard.length > 0) && (
        <div className={`p-4 ${PANEL}`}>
          <People members={members} canInvite={canInvite} onOpen={() => onOpenTab("members")} onInvite={() => onOpenTab("invite")} />
        </div>
      )}
      {/* Only when there is something new: a widget that says "nothing happened" is space taken for nothing. */}
      {hasNews(pulse, stats) && (
        <div className={`p-4 ${PANEL}`}>
          <SinceLastVisit pulse={pulse} stats={stats} onOpen={() => onOpenTab("feed")} />
        </div>
      )}
    </div>
  );
}

function WidgetHeader({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className={EYEBROW}>{title}</h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex shrink-0 items-center gap-0.5 rounded-control text-caption text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {action.label}
          <Icon icon={ChevronRight} size={16} className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- league table

/**
 * The top of this community's prediction league as a timing tower: position, face, name, points, and the gap to the
 * leader in Season's mono, the way the championship table reads. When you're outside the top rows your own line is
 * pinned under them, so you always see where you stand. Under it, the crowd against the Apex model this season.
 */
function LeagueTable({ rows, members, myUserId, crowdVsModel, onOpen }: { rows: LeaderboardRow[]; members: GroupMember[]; myUserId: string; crowdVsModel: CrowdVsModel | null; onOpen: () => void }) {
  const faces = new Map(members.map((m) => [m.userId, m.avatarUrl ?? null]));
  const leader = rows[0]?.totalScore ?? 0;
  const top = rows.slice(0, TABLE_ROWS);
  const me = rows.find((r) => r.userId === myUserId);
  const pinned = me && !top.includes(me) ? me : null;
  const record = crowdVsModel?.byCommunity[0] ?? null;

  const line = (r: LeaderboardRow) => {
    const isMe = r.userId === myUserId;
    const name = r.displayName ?? r.username ?? "Member";
    return (
      <li key={r.userId} className={`flex items-center gap-2.5 py-2 ${isMe ? "-mx-2 rounded-control bg-white/[0.04] px-2" : ""}`}>
        <span className={`w-5 shrink-0 font-mono text-caption tabular ${r.rank <= 3 ? "font-semibold text-primary" : "text-tertiary"}`}>{r.rank}</span>
        {/* The leader's line carries the one red mark in the widget. */}
        <span aria-hidden className={`h-4 w-0.5 shrink-0 rounded-full ${r.rank === 1 ? "bg-brand" : "bg-white/15"}`} />
        <EntityAvatar imageUrl={faces.get(r.userId) ?? null} name={name} seed={r.userId} size={24} />
        <span className="min-w-0 flex-1 truncate text-body-sm text-primary">
          {name}
          {isMe && <span className="ml-1.5 text-caption text-tertiary">You</span>}
        </span>
        <span className="shrink-0 text-body-sm font-semibold tabular text-primary">{compactCount(r.totalScore)}</span>
        <span className="w-12 shrink-0 text-right font-mono text-caption tabular text-tertiary">{r.rank === 1 ? "-" : `−${compactCount(leader - r.totalScore)}`}</span>
      </li>
    );
  };

  return (
    <div>
      <WidgetHeader title="League table" action={{ label: "Full table", onClick: onOpen }} />
      <ol className="mt-2" aria-label="Top of the league">
        {top.map(line)}
      </ol>
      {pinned && (
        <ol className="mt-1 border-t border-dashed border-white/[0.08] pt-1" aria-label="Your position">
          {line(pinned)}
        </ol>
      )}
      {record && record.rounds > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={EYEBROW}>Crowd vs Apex</h3>
            <span className="text-caption tabular text-tertiary">
              {record.rounds} settled round{record.rounds === 1 ? "" : "s"}
            </span>
          </div>
          <CrowdBar crowd={record.crowd} model={record.model} />
        </div>
      )}
    </div>
  );
}

/** The crowd's calls against the model's, as two figures either side of a split bar. */
function CrowdBar({ crowd, model }: { crowd: number; model: number }) {
  const total = crowd + model;
  const share = total ? (crowd / total) * 100 : 50;
  const verdict = crowd > model ? "The crowd leads" : model > crowd ? "Apex leads" : "Level";
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2.5 text-body-sm">
        <span className="shrink-0 text-secondary">
          Crowd <span className="font-semibold tabular text-primary">{crowd}</span>
        </span>
        <span aria-hidden className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <span className="h-full bg-success/80" style={{ width: `${share}%` }} />
          <span className="h-full flex-1 bg-info/70" />
        </span>
        <span className="shrink-0 text-secondary">
          <span className="font-semibold tabular text-primary">{model}</span> Apex
        </span>
      </div>
      <p className="mt-1 text-caption text-tertiary">{verdict} this season. Apex picks after qualifying; the crowd before it.</p>
    </div>
  );
}

// ---------------------------------------------------------------- open rounds

function OpenRounds({ predictions, onOpen }: { predictions: RailPrediction[]; onOpen: () => void }) {
  const now = useMinuteClock();
  return (
    <div>
      <WidgetHeader title="Open rounds" action={predictions.length ? { label: "All rounds", onClick: onOpen } : undefined} />
      {predictions.length === 0 ? (
        <p className="mt-1.5 text-body-sm text-secondary">No open rounds right now. New ones appear as a race weekend approaches.</p>
      ) : (
        <ul className="mt-1">
          {predictions.map(({ prediction, trend }) => {
            // The deadline is the server's (lockAt: the start of the weekend's qualifying), so this says "Closes in"
            // exactly while entries are still accepted.
            const lockMs = prediction.lockAt ? Date.parse(prediction.lockAt) : null;
            const isOpen = predictionStateAt(prediction.status, prediction.lockAt, now) === "open";
            const countdown = isOpen && lockMs !== null ? formatCountdown(lockMs, now) : null;
            const urgent = isOpen && lockMs !== null && lockMs - now < 24 * 60 * 60 * 1000;
            return (
              <li key={prediction.id} className="border-b border-white/[0.06] py-3 last:border-b-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-body-sm font-medium text-primary">{predictionTypeLabels[prediction.type]}</p>
                  <span className="shrink-0 text-caption tabular text-secondary">{prediction.entryPoints} pts</span>
                </div>
                <p className="mt-0.5 truncate text-caption text-tertiary">
                  {prediction.raceName} ·{" "}
                  <span className={`tabular ${urgent ? "text-warning" : ""}`}>{countdown ? `closes in ${countdown}` : "awaiting result"}</span>
                  {prediction.myEntry && <span className="text-success"> · Entered</span>}
                </p>
                <PredictionTrendBars groupId={prediction.groupId} predictionId={prediction.id} isPodium={prediction.type === "podium"} trend={trend} compact />
              </li>
            );
          })}
        </ul>
      )}
      {predictions.length > 0 && (
        <Button variant="secondary" size="md" className="mt-3 w-full" onClick={onOpen}>
          {predictions.every(({ prediction }) => prediction.myEntry) ? "Review your picks" : "Make your picks"}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- people

const PEOPLE_ROWS = 6;

function People({ members, canInvite, onOpen, onInvite }: { members: GroupMember[]; canInvite: boolean; onOpen: () => void; onInvite: () => void }) {
  return (
    <div>
      <WidgetHeader title={`${members.length} ${members.length === 1 ? "member" : "members"}`} action={members.length > PEOPLE_ROWS ? { label: "All", onClick: onOpen } : undefined} />
      <ul className="mt-3 space-y-2.5">
        {members.slice(0, PEOPLE_ROWS).map((m) => (
          <li key={m.userId} className="flex items-center gap-2.5">
            <EntityAvatar imageUrl={m.avatarUrl ?? null} name={m.displayName ?? m.username ?? "M"} seed={m.userId} size={28} />
            <span className="min-w-0 flex-1 truncate text-body-sm text-primary">{m.displayName ?? m.username ?? "Member"}</span>
            {m.role !== "member" && <span className="shrink-0 text-caption capitalize text-tertiary">{m.role}</span>}
          </li>
        ))}
      </ul>
      {canInvite && (
        <Button variant="secondary" size="sm" iconStart={UserPlus} className="mt-4 w-full" onClick={onInvite}>
          Invite people
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- since your last visit

function hasNews(pulse: GroupPulse, stats: GroupStats): boolean {
  return pulse.hasPriorVisit ? pulse.newPosts + pulse.repliesToYou + pulse.newPredictionEntries + pulse.newMembers > 0 : stats.weeklyPosts + stats.activeMembers > 0;
}

/** A computed digest, not a model call: every figure is a count over this community's own tables. A first visit has
 * nothing to diff against, so it shows the week instead of claiming "nothing new" about a visit that never happened. */
function SinceLastVisit({ pulse, stats, onOpen }: { pulse: GroupPulse; stats: GroupStats; onOpen: () => void }) {
  const figures = pulse.hasPriorVisit
    ? [
        { label: "new posts", count: pulse.newPosts },
        { label: pulse.repliesToYou === 1 ? "reply to you" : "replies to you", count: pulse.repliesToYou },
        { label: "new picks", count: pulse.newPredictionEntries },
        { label: pulse.newMembers === 1 ? "new member" : "new members", count: pulse.newMembers },
      ]
    : [
        { label: "posts this week", count: stats.weeklyPosts },
        { label: "active members", count: stats.activeMembers },
      ];
  return (
    <div>
      <WidgetHeader title={pulse.hasPriorVisit ? "Since your last visit" : "This week here"} action={pulse.hasPriorVisit ? { label: "Feed", onClick: onOpen } : undefined} />
      {/* Only the figures that moved. */}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2.5">
        {figures
          .filter((f) => f.count > 0)
          .map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="sr-only">{f.label}</dt>
              <dd className={`text-body font-semibold tabular ${f.count > 0 ? "text-primary" : "text-tertiary"}`}>{compactCount(f.count)}</dd>
              <dd className="truncate text-caption text-secondary">{f.label}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
