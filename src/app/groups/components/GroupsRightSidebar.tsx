"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { compactCount } from "@/lib/format";
import { Check, ChevronRight } from "lucide-react";
// predictionTypeLabels from the pure groupPredictionTypes.ts, not groupPredictions.ts - the same
// nodemailer-in-client-bundle crash this session has already hit twice (see that file's own
// comment). FeedPrediction is a type-only import, which is always erased regardless of source.
import { predictionStateAt, predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { PublicGroupSummary } from "@/lib/supabase/groups";
import { groupHref, raceHref } from "@/lib/routes";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Dialog";
import { FitStack } from "./FitStack";
import { CrowdVsApexWidget } from "./CrowdVsApexWidget";
import type { CrowdVsModel } from "@/lib/supabase/communityWeekend";
import { EYEBROW, PANEL } from "./panel";
import { RollingText } from "@/components/ui/RollingNumber";
import { RingChart, Ring, RingCenter } from "@/components/charts/ring/ring-chart";
import { ApexWidget } from "./ApexWidget";

export type NextRace = { year: number; round: number; name: string; raceDate: string | null; country: string | null; circuit: string | null; photoUrl: string | null } | null;

/**
 * The race-weekend rail, beside the feed from xl: the next race, Apex's read and questions, the rounds open to
 * predict, and communities to join, as separate widgets in that priority order. It never scrolls (only the feed does) and never cuts a
 * widget in half: on a short window the lowest-priority widget is dropped whole (FitStack). Below lg it follows
 * the feed as a plain stack.
 *
 * Every value is real: the race row and its photo from the pipeline, the countdown from its `race_date`, the
 * rounds from listMyPredictions filtered to those still taking entries by the server's own deadline.
 */
export function GroupsRightSidebar({
  predictions,
  nextRace,
  suggestions = [],
  onDiscover,
  fixedHeight = true,
  crowdVsModel = null,
}: {
  /** Your communities against the Apex model this season. */
  crowdVsModel?: CrowdVsModel | null;
  /** Whether the rail is the fixed-height column beside the scrolling feed (from xl) or simply follows the page. */
  fixedHeight?: boolean;
  predictions: FeedPrediction[];
  nextRace: NextRace;
  /** Public communities the viewer isn't in, for "Communities to join". */
  suggestions?: PublicGroupSummary[];
  onDiscover?: () => void;
}) {
  return (
    <FitStack when={fixedHeight ? FIXED_HEIGHT : "not all"} className={fixedHeight ? "xl:h-full xl:overflow-hidden" : ""} gap={12}>
      <div data-tour="race-weekend" className={`${WIDGET} overflow-hidden`}>
        <RaceWeekend race={nextRace} />
      </div>
      <div className={`${WIDGET} p-4`}>
        <ApexWidget location={nextRace?.circuit ?? null} year={nextRace?.year ?? null} />
      </div>
      <div className={`${WIDGET} p-4`}>
        <ActivePredictions predictions={predictions} crowdVsModel={crowdVsModel} />
      </div>
      {suggestions.length > 0 && (
        <div className={`${WIDGET} p-4`}>
          <SuggestedCommunities communities={suggestions} onDiscover={onDiscover} />
        </div>
      )}
    </FitStack>
  );
}

/** Where the rail is a fixed-height column beside the feed (GroupsHomeClient's app shell). */
const FIXED_HEIGHT = "(min-width: 1280px)";

/** A rail widget: the site's glass panel (as Season draws its sections), so the rails read as a set of widgets. */
const WIDGET = PANEL;

/** "Who to follow", for communities: a few public ones you're not in, each a tap from joining. Joining goes through
 * the same endpoint as Discover's cards, then opens the community. */
function SuggestedCommunities({ communities, onDiscover }: { communities: PublicGroupSummary[]; onDiscover?: () => void }) {
  const router = useRouter();
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function join(id: string) {
    setJoining(id);
    setError(null);
    const res = await fetch(`/api/groups/${id}/join`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setError(id);
      setJoining(null);
      return;
    }
    router.push(groupHref(id));
  }
  return (
    <div>
      <h3 className={EYEBROW}>Communities to join</h3>
      <ul className="mt-2">
        {communities.map((c) => (
          <li key={c.id} className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-b-0">
            <Link href={groupHref(c.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
              <EntityAvatar imageUrl={c.avatarUrl} name={c.name} seed={c.id} size={28} />
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-medium text-primary hover:underline">{c.name}</span>
                <span className="block truncate text-caption text-secondary">
                  {compactCount(c.memberCount)} members{c.activePredictions ? ` · ${c.activePredictions} open round${c.activePredictions === 1 ? "" : "s"}` : ""}
                </span>
                {error === c.id && <span className="block text-caption text-danger">Couldn&apos;t join. Try again.</span>}
              </span>
            </Link>
            <Button variant="secondary" size="sm" loading={joining === c.id} onClick={() => void join(c.id)}>
              Join
            </Button>
          </li>
        ))}
      </ul>
      {onDiscover && (
        <button type="button" onClick={onDiscover} className="mt-1 flex h-8 items-center gap-0.5 rounded-control text-body-sm text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          Discover more
          <Icon icon={ChevronRight} size={16} />
        </button>
      )}
    </div>
  );
}

/** The next race, stated the way the home page states it: the round as a single caption, the name large, then the
 * countdown as the figure (to lights out, the one session time a race row carries). The circuit photo sits above
 * when the pipeline has one. */
function RaceWeekend({ race }: { race: NextRace }) {
  const now = useMinuteClock();
  const raceAt = race?.raceDate ? parseUtcDateTime(race.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;

  if (!race) {
    return (
      <div className="p-4">
        <h3 className={EYEBROW}>Race weekend</h3>
        <p className="mt-1 text-body-sm text-secondary">No upcoming race is scheduled yet.</p>
      </div>
    );
  }
  return (
    <Link href={raceHref(race.year, race.round, race.name)} className="group block rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring">
      {race.photoUrl && (
        <div className="relative aspect-[8/3] overflow-hidden">
          <Image src={race.photoUrl} alt="" fill sizes="320px" className="object-cover transition-transform duration-slow ease-standard group-hover:scale-[1.03] motion-reduce:transition-none" />
        </div>
      )}
      <div className="p-4">
        <p className="text-caption text-secondary">
          Round {race.round}
          {race.country ? ` · ${race.country}` : ""}
        </p>
        <p className="mt-0.5 text-body font-semibold text-primary underline-offset-4 group-hover:underline">{race.name}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-caption text-secondary">{countdown ? "Lights out in" : "Race weekend"}</p>
            {/* The digits turn over in place each minute (NumberFlow) instead of the line re-rendering. */}
            <p suppressHydrationWarning className="text-title-md font-semibold tabular text-primary">
              {countdown ? <RollingText text={countdown} /> : "Underway"}
            </p>
          </div>
          {race.raceDate && (
            <p className="pb-1 text-body-sm text-secondary">{new Date(race.raceDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

/** How many open rounds the rail lists before "See all". */
const RAIL_ROUNDS = 2;

/**
 * Rounds still taking entries, by the server's deadline (`lockAt`) against the ticking clock, so a round leaves
 * the minute it closes. The ones you haven't entered come first, then the soonest to close; two are listed and the
 * rest open in a dialog. Each row says what you'd play for (its entry points) and where you stand.
 */
function ActivePredictions({ predictions: allPredictions, crowdVsModel }: { predictions: FeedPrediction[]; crowdVsModel: CrowdVsModel | null }) {
  const now = useMinuteClock();
  const [showAll, setShowAll] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const open = allPredictions
    .filter((p) => predictionStateAt(p.status, p.lockAt, now) === "open")
    .sort((a, b) => Number(a.hasEntered) - Number(b.hasEntered) || (a.lockAt ? Date.parse(a.lockAt) : Infinity) - (b.lockAt ? Date.parse(b.lockAt) : Infinity));
  const shown = open.slice(0, RAIL_ROUNDS);
  const entered = open.filter((p) => p.hasEntered).length;
  // The soonest deadline among the rounds you haven't entered: the one thing in this widget that can't wait.
  const nextLock = open.filter((p) => !p.hasEntered && p.lockAt).map((p) => Date.parse(p.lockAt as string)).sort((a, b) => a - b)[0];

  return (
    <div>
      <div className="flex items-center gap-3">
        {/* Your weekend at a glance: a Bklit ring filling as you enter this weekend's open rounds. */}
        {open.length > 0 && (
          <RingChart
            size={40}
            strokeWidth={4}
            ringGap={0}
            baseInnerRadius={14}
            ariaLabel={`You've entered ${entered} of ${open.length} open rounds`}
            data={[{ label: "entered", value: entered, maxValue: open.length, color: "var(--success)" }]}
          >
            <Ring index={0} />
            <RingCenter valueClassName="text-caption font-semibold text-primary" labelClassName="sr-only">
              <span className="text-caption font-semibold tabular text-primary">
                {entered}/{open.length}
              </span>
            </RingCenter>
          </RingChart>
        )}
        <div className="min-w-0 flex-1">
          <h3 className={EYEBROW}>Open rounds</h3>
          {open.length > 0 && (
            <p suppressHydrationWarning className="truncate text-caption text-secondary">
              {/* The ring carries "1/3"; this line carries what it can't: when the next one you haven't entered closes. */}
              {entered === open.length ? "All entered" : nextLock !== undefined ? `Next closes in ${formatCountdown(nextLock, now)}` : `${open.length - entered} to enter`}
            </p>
          )}
        </div>
        {open.length > RAIL_ROUNDS && (
          <button type="button" onClick={() => setShowAll(true)} className="shrink-0 rounded-control text-body-sm text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            See all <span className="tabular">{open.length}</span>
          </button>
        )}
      </div>
      {open.length === 0 ? (
        <p className="mt-1 text-body-sm text-secondary">None open right now. Rounds open as a race weekend approaches.</p>
      ) : (
        <ul className="mt-2">
          {shown.map((p) => (
            <li key={p.id} className="border-b border-white/[0.06] last:border-b-0">
              <RoundRow prediction={p} now={now} />
            </li>
          ))}
        </ul>
      )}
      {/* Crowd vs Apex, the season's running score, under the rounds it's made of: one line, the breakdown a click
          away. Shown before any round has settled too, so the rivalry is known before it starts. */}
      {crowdVsModel && <CrowdVsApexLine record={crowdVsModel} onOpen={() => setShowRecord(true)} />}

      <Dialog open={showAll} onClose={() => setShowAll(false)} title="Open prediction rounds" size="sm">
        <ul>
          {open.map((p) => (
            <li key={p.id} className="border-b border-white/[0.06] last:border-b-0">
              <RoundRow prediction={p} now={now} />
            </li>
          ))}
        </ul>
      </Dialog>
      {crowdVsModel && (
        <Dialog open={showRecord} onClose={() => setShowRecord(false)} title="Crowd vs Apex" size="sm">
          <CrowdVsApexWidget record={crowdVsModel} heading={false} />
        </Dialog>
      )}
    </div>
  );
}

/** The season's crowd-vs-Apex score in one line: your communities' right calls against the model's, with the split
 * drawn between them. Opens the full record. */
function CrowdVsApexLine({ record, onOpen }: { record: CrowdVsModel; onOpen: () => void }) {
  const { crowd, model, rounds } = record.overall;
  const share = crowd + model > 0 ? crowd / (crowd + model) : 0.5;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="-mx-2 mt-2 block w-[calc(100%+1rem)] rounded-control border-t border-white/[0.06] px-2 pb-1 pt-3 text-left transition-colors duration-fast hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span className="flex items-center justify-between gap-2">
        <span className={EYEBROW}>Crowd vs Apex</span>
        <span className="flex items-center gap-0.5 text-caption text-secondary">
          {rounds ? `${rounds} settled` : "Season record"}
          <Icon icon={ChevronRight} size={16} className="size-3.5" />
        </span>
      </span>
      {rounds ? (
        <span className="mt-1.5 flex items-center gap-2 text-caption text-secondary">
          <span className="shrink-0">
            You <span className="text-body-sm font-semibold tabular text-primary">{crowd}</span>
          </span>
          <span aria-hidden className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="h-full bg-success" style={{ width: `${share * 100}%` }} />
            <span className="h-full flex-1 bg-info/70" />
          </span>
          <span className="shrink-0">
            <span className="text-body-sm font-semibold tabular text-primary">{model}</span> Apex
          </span>
        </span>
      ) : (
        <span className="mt-1 block text-caption text-secondary">Your communities against the Apex model, scored as rounds settle.</span>
      )}
    </button>
  );
}

/** One round: race and type, the community it's in, the entry points, and entered (with the pick) or the time left.
 * Deep-links to that community's Predictions tab (CommunityTabs reads ?tab=). */
function RoundRow({ prediction: p, now }: { prediction: FeedPrediction; now: number }) {
  const lockMs = p.lockAt ? Date.parse(p.lockAt) : null;
  const countdown = lockMs !== null ? formatCountdown(lockMs, now) : null;
  // The last three hours are when "when" stops being background information.
  const soon = lockMs !== null && lockMs - now < 3 * 60 * 60 * 1000;
  return (
    <Link
      href={`${groupHref(p.groupId)}?tab=predictions`}
      className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 transition-colors duration-fast hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-medium text-primary">{predictionTypeLabels[p.type]}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-caption text-secondary">
          {p.hasEntered ? (
            <>
              <Icon icon={Check} size={16} className="size-3.5 shrink-0 text-success" />
              <span className="min-w-0 truncate">{p.myGuessLabel ? `You picked ${p.myGuessLabel}` : "Entered"}</span>
            </>
          ) : (
            <span suppressHydrationWarning className="min-w-0 truncate tabular">
              {p.groupName}
              {countdown && (
                <>
                  {" · "}
                  <span className={soon ? "font-medium text-warning" : ""}>closes in {countdown}</span>
                </>
              )}
            </span>
          )}
        </span>
      </span>
      {/* Entered rounds step their figure back: the rows still to act on lead. */}
      <span className={`shrink-0 text-body-sm tabular ${p.hasEntered ? "text-tertiary" : "font-medium text-primary"}`}>{p.entryPoints} pts</span>
    </Link>
  );
}
