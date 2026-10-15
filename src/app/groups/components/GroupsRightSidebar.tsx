"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { compactCount } from "@/lib/format";
import { Check, ChevronRight, Clock } from "lucide-react";
// predictionTypeLabels from the pure groupPredictionTypes.ts, not groupPredictions.ts - the same
// nodemailer-in-client-bundle crash this session has already hit twice (see that file's own
// comment). FeedPrediction is a type-only import, which is always erased regardless of source.
import { predictionStateAt, predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { PublicGroupSummary } from "@/lib/supabase/groups";
import { groupHref, raceHref } from "@/lib/routes";
import { countryFlag } from "@/lib/countryFlag";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Dialog";
import { FitStack } from "./FitStack";

export type NextRace = { year: number; round: number; name: string; raceDate: string | null; country: string | null; circuit: string | null; photoUrl: string | null } | null;

/**
 * The race-weekend rail, beside the feed from xl: the next race, the rounds open to predict, and communities to
 * join, as separate compact widgets in that priority order. It never scrolls (only the feed does) and never cuts a
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
}: {
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
      <div data-tour="race-weekend" className={WIDGET}>
        <RaceWeekend race={nextRace} />
      </div>
      <div className={`${WIDGET} p-3`}>
        <ActivePredictions predictions={predictions} />
      </div>
      {suggestions.length > 0 && (
        <div className={`${WIDGET} p-3`}>
          <SuggestedCommunities communities={suggestions} onDiscover={onDiscover} />
        </div>
      )}
    </FitStack>
  );
}

/** Where the rail is a fixed-height column beside the feed (GroupsHomeClient's app shell). */
const FIXED_HEIGHT = "(min-width: 1280px)";

const WIDGET = "overflow-hidden rounded-card border border-white/[0.08] bg-surface-1/70";

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
      <h3 className="px-1 text-body-sm font-semibold text-primary">Communities to join</h3>
      <ul className="mt-2 space-y-1">
        {communities.map((c) => (
          <li key={c.id} className="flex items-center gap-2.5 px-1 py-1">
            <Link href={groupHref(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
              <EntityAvatar imageUrl={c.avatarUrl} name={c.name} seed={c.id} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-semibold text-primary hover:underline">{c.name}</span>
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
        <button type="button" onClick={onDiscover} className="mt-1 h-8 rounded-control px-1 text-caption font-medium text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          See more communities
        </button>
      )}
    </div>
  );
}

/** The next race over its own photo where the pipeline has one: round and date, the name, the countdown to lights
 * out (the one session time a race row carries, so no qualifying or sprint time is claimed), and a way to it. */
function RaceWeekend({ race }: { race: NextRace }) {
  const now = useMinuteClock();
  const raceAt = race?.raceDate ? parseUtcDateTime(race.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const flag = countryFlag(race?.country);

  if (!race) {
    return (
      <div className="p-3">
        <h3 className="px-1 text-body-sm font-semibold text-primary">Race weekend</h3>
        <p className="mt-1 px-1 text-caption text-secondary">No upcoming race is scheduled yet.</p>
      </div>
    );
  }
  return (
    <Link href={raceHref(race.year, race.round, race.name)} className="group relative block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring">
      {race.photoUrl && (
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <Image src={race.photoUrl} alt="" fill sizes="340px" className="object-cover opacity-90 transition-transform duration-slow ease-standard group-hover:scale-[1.03] motion-reduce:transition-none" />
          {/* The two washes, not a dimmed photo, are what keep the text legible over any bright patch. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-surface-1" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface-1/80 via-surface-1/30 to-transparent" />
        </div>
      )}
      <div className={`relative flex flex-col justify-end p-4 ${race.photoUrl ? "min-h-[8.5rem]" : ""}`}>
        <p className="text-caption text-secondary">
          Round {race.round}
          {race.raceDate && (
            <>
              {" · "}
              {new Date(race.raceDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </>
          )}
        </p>
        <p className="mt-0.5 flex items-start gap-1.5 text-title-md font-semibold leading-snug text-primary">
          {flag && (
            <span aria-hidden className="shrink-0">
              {flag}
            </span>
          )}
          <span className="min-w-0">{race.name}</span>
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          {countdown ? (
            <span suppressHydrationWarning className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-caption font-medium tabular text-primary backdrop-blur">
              <Icon icon={Clock} size={16} className="size-3 text-tertiary" />
              Lights out in {countdown}
            </span>
          ) : (
            <span className="text-caption text-secondary">Race weekend underway</span>
          )}
          <span className="flex items-center gap-0.5 text-caption font-medium text-secondary transition-colors duration-fast group-hover:text-primary">
            Race
            <Icon icon={ChevronRight} size={16} className="size-3.5" />
          </span>
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
function ActivePredictions({ predictions: allPredictions }: { predictions: FeedPrediction[] }) {
  const now = useMinuteClock();
  const [showAll, setShowAll] = useState(false);
  const open = allPredictions
    .filter((p) => predictionStateAt(p.status, p.lockAt, now) === "open")
    .sort((a, b) => Number(a.hasEntered) - Number(b.hasEntered) || (a.lockAt ? Date.parse(a.lockAt) : Infinity) - (b.lockAt ? Date.parse(b.lockAt) : Infinity));
  const shown = open.slice(0, RAIL_ROUNDS);

  return (
    <div>
      <div className="flex h-7 items-center justify-between gap-2 px-1">
        <h3 className="text-body-sm font-semibold text-primary">Open rounds</h3>
        {open.length > RAIL_ROUNDS && (
          <button type="button" onClick={() => setShowAll(true)} className="rounded-control text-caption font-medium text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            See all <span className="tabular">{open.length}</span>
          </button>
        )}
      </div>
      {open.length === 0 ? (
        <p className="mt-1 px-1 text-caption text-secondary">None open right now. Rounds open as a race weekend approaches.</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {shown.map((p) => (
            <li key={p.id}>
              <RoundRow prediction={p} now={now} />
            </li>
          ))}
        </ul>
      )}
      <Dialog open={showAll} onClose={() => setShowAll(false)} title="Open prediction rounds" size="sm">
        <ul className="space-y-1.5">
          {open.map((p) => (
            <li key={p.id}>
              <RoundRow prediction={p} now={now} />
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

/** One round: race and type, the community it's in, the entry points, and entered (with the pick) or the time left.
 * Deep-links to that community's Predictions tab (CommunityTabs reads ?tab=). */
function RoundRow({ prediction: p, now }: { prediction: FeedPrediction; now: number }) {
  const lockMs = p.lockAt ? Date.parse(p.lockAt) : null;
  const countdown = lockMs !== null ? formatCountdown(lockMs, now) : null;
  // Under a day left is when "when" stops being background information.
  const urgent = lockMs !== null && lockMs - now < 24 * 60 * 60 * 1000;
  return (
    <Link
      href={`${groupHref(p.groupId)}?tab=predictions`}
      className="flex items-center gap-2.5 rounded-control bg-surface-2/60 px-2.5 py-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-medium text-primary">
          {predictionTypeLabels[p.type]} · {p.raceName}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-caption">
          {p.hasEntered ? (
            <>
              <Icon icon={Check} size={16} className="size-3 shrink-0 text-success" />
              <span className="min-w-0 truncate text-secondary">{p.myGuessLabel ? `You picked ${p.myGuessLabel}` : "Entered"}</span>
            </>
          ) : countdown ? (
            <span suppressHydrationWarning className={`truncate tabular ${urgent ? "font-medium text-warning" : "text-secondary"}`}>
              Closes in {countdown} · {p.groupName}
            </span>
          ) : (
            <span className="truncate text-secondary">{p.groupName}</span>
          )}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-caption font-semibold tabular text-primary">{p.entryPoints} pts</span>
    </Link>
  );
}
