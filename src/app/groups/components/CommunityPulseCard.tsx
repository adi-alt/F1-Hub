"use client";

import Link from "next/link";
import { MessageSquare, Reply, TrendingUp } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";

/**
 * What changed across your communities, under the communities list. Every number is real: a returning viewer
 * gets the delta since their last visit (getCommunityPulse), a first-time one the standing picture from the
 * groups' own weekly counts, because "nothing changed since your last visit" would describe a visit that never
 * happened. Rows with a zero count are dropped rather than shown as "0 new discussions".
 *
 * Compact on purpose: it shares a rail that never scrolls with the communities list, so it is a few counted
 * rows and one named conversation, not a dashboard.
 */
export function CommunityPulseCard({ groups, pulse }: { groups: GroupSummary[]; pulse: CommunityPulseData }) {
  const weeklyPosts = groups.reduce((sum, g) => sum + g.weeklyPosts, 0);
  const openPredictions = groups.reduce((sum, g) => sum + g.activePredictions, 0);
  const weeklyMostActive = groups.reduce<GroupSummary | null>((best, g) => (g.weeklyPosts > 0 && (!best || g.weeklyPosts > best.weeklyPosts) ? g : best), null);

  const rows = (
    pulse.hasPriorVisit
      ? [
          { key: "posts", icon: MessageSquare, count: pulse.newPosts, label: pulse.newPosts === 1 ? "new discussion" : "new discussions" },
          { key: "replies", icon: Reply, count: pulse.repliesToYou, label: pulse.repliesToYou === 1 ? "reply to you" : "replies to you" },
          { key: "entries", icon: TrendingUp, count: pulse.newPredictionEntries, label: pulse.newPredictionEntries === 1 ? "new prediction entry" : "new prediction entries" },
        ]
      : [
          { key: "posts", icon: MessageSquare, count: weeklyPosts, label: weeklyPosts === 1 ? "discussion this week" : "discussions this week" },
          { key: "open", icon: TrendingUp, count: openPredictions, label: openPredictions === 1 ? "open prediction" : "open predictions" },
        ]
  ).filter((r) => r.count > 0);
  const trending = pulse.hasPriorVisit ? pulse.mostActive : weeklyMostActive ? { id: weeklyMostActive.id, name: weeklyMostActive.name } : null;
  const quiet = rows.length === 0 && !trending && !pulse.mostDiscussed;

  return (
    <section aria-labelledby="community-pulse" className="rounded-card border border-white/[0.08] bg-surface-1/70 p-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 id="community-pulse" className="text-body-sm font-semibold text-primary">
          Pulse
        </h3>
        <span className="truncate text-caption text-tertiary">{pulse.hasPriorVisit ? "Since your last visit" : "This week"}</span>
      </div>

      {quiet ? (
        <p className="mt-2 px-1 text-caption text-secondary">{pulse.hasPriorVisit ? "You're caught up." : "No activity yet."}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.key} className="flex h-7 items-center gap-2 px-1">
              <Icon icon={r.icon} size={16} className="shrink-0 text-tertiary" />
              <span className="text-body-sm font-semibold tabular text-primary">{r.count}</span>
              <span className="min-w-0 truncate text-caption text-secondary">{r.label}</span>
            </li>
          ))}
          {trending && (
            <li>
              <Link href={groupHref(trending.id)} className="flex h-7 items-center gap-2 rounded-control px-1 text-caption text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                <Icon icon={TrendingUp} size={16} className="shrink-0 text-success" />
                <span className="min-w-0 truncate">
                  <span className="font-medium text-primary">{trending.name}</span> is trending
                </span>
              </Link>
            </li>
          )}
          {/* One named conversation to go and read; opens that post's discussion on its community page. */}
          {pulse.mostDiscussed && (
            <li className="pt-1">
              <Link
                href={`${groupHref(pulse.mostDiscussed.groupId)}?post=${pulse.mostDiscussed.postId}`}
                className="block rounded-control bg-surface-2/60 px-2.5 py-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className="block text-caption text-tertiary">
                  Most discussed · <span className="tabular">{pulse.mostDiscussed.comments}</span> {pulse.mostDiscussed.comments === 1 ? "reply" : "replies"}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-body-sm leading-5 text-primary">{pulse.mostDiscussed.excerpt}</span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
