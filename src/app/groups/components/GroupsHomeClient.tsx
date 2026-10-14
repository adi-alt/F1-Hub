"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Compass, MessageSquare, Plus, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateCommunityModal } from "./create/CreateCommunityModal";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary, PublicGroupSummary } from "@/lib/supabase/groups";
import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { DiscoverSheet } from "./discover/DiscoverSheet";
import { GroupsFeed } from "./GroupsFeed";
import { CommunityFilter } from "./CommunityFilter";
import { CommunityPulse, type NextRace } from "./home/CommunityPulse";
import { CommunityCard } from "./CommunityCard";
import { CommunityTiles } from "./home/CommunityTiles";
import { ThisWeekend } from "./home/ThisWeekend";
import type { RaceOption } from "./post/PredictionComposer";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";

/** The Communities home: a page header with the two community-level actions (Discover, New community), then your
 * communities as a rail, the feed across them (or one community's own stream, picked in the rail), and the race
 * weekend beside it from xl. Someone in no community yet gets the way in instead of an empty feed.
 *
 * Below lg it is one column: the feed (with a chip strip to pick a community), then the race weekend. From lg the
 * rail of communities is sticky beside the feed; from xl the context rail joins on the right. The document scrolls
 * the feed (audit R-31). */
export function GroupsHomeClient({
  groups,
  initialPosts,
  initialCursor,
  predictions,
  nextRace,
  upcomingRaces,
  pulse,
  driversByRace,
  suggestions = [],
}: {
  groups: GroupSummary[];
  initialPosts: FeedPost[];
  initialCursor: string | null;
  predictions: FeedPrediction[];
  nextRace: NextRace;
  upcomingRaces: RaceOption[];
  pulse: CommunityPulseData;
  /** Driver roster per race id, for the open rounds shown in the feed. */
  driversByRace: Record<string, { code: string; name: string; headshotUrl: string | null }[]>;
  /** Public communities the viewer isn't in, for the Discover section. */
  suggestions?: PublicGroupSummary[];
}) {
  const [showDiscover, setShowDiscover] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  // The one piece of real interaction state this page adds: which community (if any) the left
  // rail has selected, which is what actually feeds the center column now - see GroupsFeed's own
  // comment. Lives here because both the rail (which row is active) and the feed (which stream to
  // fetch) need it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCommunity = selectedId ? (groups.find((g) => g.id === selectedId) ?? null) : null;

  // Picking another community swaps the feed, so bring its top into view: the page scrolls now, and the
  // rail you picked it from is sticky, so you may be many posts down. Not on first render.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [selectedId]);

  // Two real scopes, not one that quietly ignores half its own state:
  //
  //  - "All" selected: the communities index - what you're in and what's happening across them.
  //    No communityId, so the route's own buildCommunityIndexGroundingContext re-derives the real
  //    facts (your groups, open predictions, recent feed posts) server-side from the same
  //    getUserGroups/listMyPredictions/listFeedPosts queries this page's own server component
  //    already used.
  //  - a community selected: communityId is set, which routes the SAME request through
  //    buildCommunityGroundingContext instead - the exact server builder the community's own page
  //    uses (getGroupDetail + requireMember, real membership-verified data), not a second, weaker
  //    version built for this page alone. snapshot.community.currentTab mirrors CommunityTabs.tsx's
  //    own shape ("feed" - this rail shows that community's feed, nothing else) so one builder
  //    serves both surfaces without needing to know which one asked.
  //
  // Either way, nothing here is trusted for facts, only for "what's currently in view" - and the
  // suggestions only ever promise what that specific server builder can actually answer.
  const scopeKey = selectedCommunity ? `community:${selectedCommunity.id}` : "communities-index";
  useRegisterApexScope(
    selectedCommunity
      ? {
          key: scopeKey,
          label: selectedCommunity.name,
          sublabel: "Feed",
          communityId: selectedCommunity.id,
          suggestions: ["What is this community discussing most?", "Summarise the recent posts here.", "Are there any open predictions in this community?"],
          context: {
            page: "community",
            snapshot: { community: { currentTab: "feed" } },
          },
        }
      : {
          key: scopeKey,
          label: "Your communities",
          sublabel: `${groups.length} joined`,
          suggestions: ["What's happening across my communities?", "Which predictions close soonest?", "Which of my communities is most active?"],
          context: {
            page: "community",
            snapshot: { view: "index" },
          },
        },
  );

  return (
    <div>
      <PageHeader
        title="Communities"
        meta="Your leagues and the people you follow the sport with: this weekend's prediction rounds, the conversation, and where you stand."
        actions={
          <>
            <Button variant="secondary" size="md" iconStart={Compass} onClick={() => setShowDiscover(true)}>
              Discover
            </Button>
            <Button variant="primary" size="md" iconStart={Plus} onClick={() => setShowCreate(true)}>
              New community
            </Button>
          </>
        }
      />

      {groups.length === 0 ? (
        <div className="mt-10 space-y-12">
          <GetStarted onDiscover={() => setShowDiscover(true)} onCreate={() => setShowCreate(true)} />
          <ThisWeekend race={nextRace} predictions={predictions} groups={groups} />
          <Suggestions communities={suggestions} onDiscover={() => setShowDiscover(true)} title="Communities to join" />
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          <ThisWeekend race={nextRace} predictions={predictions} groups={groups} />
          <CommunityTiles groups={groups} onCreate={() => setShowCreate(true)} />

          {/* The conversation: the feed across your communities (or one of them, picked in the chips), with the
              community pulse beside it from xl. */}
          <section aria-labelledby="conversation">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="conversation" className="text-title-lg text-primary">
                The conversation
              </h2>
              <p className="text-body-sm text-secondary">{selectedCommunity ? `In ${selectedCommunity.name}` : "Across all your communities"}</p>
            </div>
            <div className="mt-4">
              <CommunityFilter groups={groups} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
              <div className="min-w-0">
                <GroupsFeed groups={groups} initialPosts={initialPosts} initialCursor={initialCursor} selectedCommunity={selectedCommunity} predictions={predictions} upcomingRaces={upcomingRaces} driversByRace={driversByRace} />
              </div>
              <aside aria-label="Community pulse" className="xl:sticky xl:top-20">
                <div className="rounded-card border border-white/10 bg-surface-1/70 p-4">
                  <CommunityPulse groups={groups} pulse={pulse} />
                </div>
              </aside>
            </div>
          </section>

          {suggestions.length > 0 && <Suggestions communities={suggestions} onDiscover={() => setShowDiscover(true)} title="More communities" />}
        </div>
      )}

      <AnimatePresence>{showDiscover && <DiscoverSheet onClose={() => setShowDiscover(false)} />}</AnimatePresence>
      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

/** Public communities to join, as the same cards Discover uses, with the way into the full directory. */
function Suggestions({ communities, onDiscover, title }: { communities: PublicGroupSummary[]; onDiscover: () => void; title: string }) {
  return (
    <section aria-labelledby="suggestions">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="suggestions" className="text-title-lg text-primary">
          {title}
        </h2>
        <Button variant="ghost" size="sm" iconStart={Compass} onClick={onDiscover}>
          Browse all
        </Button>
      </div>
      {communities.length > 0 ? (
        <ul className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
          {communities.map((c, i) => (
            <li key={c.id} className="w-[80%] min-w-0 shrink-0 snap-start sm:w-auto">
              <CommunityCard community={c} index={i} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-body-sm text-secondary">No public communities to suggest right now. Start your own and invite friends.</p>
      )}
    </section>
  );
}

/** For someone in no community yet: what communities are for, and the two ways in. */
function GetStarted({ onDiscover, onCreate }: { onDiscover: () => void; onCreate: () => void }) {
  const points = [
    { icon: Trophy, title: "Prediction rounds", text: "Pick the podium for each Grand Prix and climb your community's leaderboard." },
    { icon: MessageSquare, title: "Race-weekend talk", text: "Qualifying, strategy calls and the result, with people who follow the same team." },
    { icon: Users, title: "Your own league", text: "Start a private community for friends, with its own rounds and rules." },
  ];
  return (
    <section aria-labelledby="get-started" className="surface-glass overflow-hidden rounded-card border border-white/10">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-1 text-caption text-secondary">Communities</span>
      </div>
      <div className="p-6 sm:p-8">
        <h2 id="get-started" className="text-title-lg text-primary">
          You&apos;re not in a community yet
        </h2>
        <p className="mt-2 max-w-xl text-body-sm text-secondary">Join one to see its conversation and prediction rounds here, or start your own.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {points.map((pt) => (
            <li key={pt.title} className="rounded-card bg-surface-2/60 p-4">
              <Icon icon={pt.icon} size={20} className="text-secondary" />
              <p className="mt-3 text-body-sm font-semibold text-primary">{pt.title}</p>
              <p className="mt-1 text-caption text-secondary">{pt.text}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" size="md" iconStart={Compass} onClick={onDiscover}>
            Discover communities
          </Button>
          <Button variant="secondary" size="md" iconStart={Plus} onClick={onCreate}>
            Start your own
          </Button>
        </div>
      </div>
    </section>
  );
}
