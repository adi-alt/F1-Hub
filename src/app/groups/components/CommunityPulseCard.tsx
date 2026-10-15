"use client";

import Link from "next/link";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";

/**
 * What changed across your communities, under the communities list. Every number is real: a returning viewer
 * gets the delta since their last visit (getCommunityPulse), a first-time one the standing picture from the
 * groups' own weekly counts, because "nothing changed since your last visit" would describe a visit that never
 * happened. Rows with a zero count are dropped rather than shown as "0 new discussions".
 *
 * Compact on purpose: it shares a rail that never scrolls with the communities list, so it is three figures and
 * one named conversation, not a dashboard.
 */
export function CommunityPulseCard({ groups, pulse }: { groups: GroupSummary[]; pulse: CommunityPulseData }) {
  const weeklyPosts = groups.reduce((sum, g) => sum + g.weeklyPosts, 0);
  const openPredictions = groups.reduce((sum, g) => sum + g.activePredictions, 0);

  const stats = pulse.hasPriorVisit
    ? [
        { key: "posts", count: pulse.newPosts, label: pulse.newPosts === 1 ? "new post" : "new posts" },
        { key: "replies", count: pulse.repliesToYou, label: pulse.repliesToYou === 1 ? "reply" : "replies" },
        { key: "entries", count: pulse.newPredictionEntries, label: pulse.newPredictionEntries === 1 ? "new pick" : "new picks" },
      ]
    : [
        { key: "posts", count: weeklyPosts, label: weeklyPosts === 1 ? "post this week" : "posts this week" },
        { key: "open", count: openPredictions, label: openPredictions === 1 ? "open round" : "open rounds" },
      ];
  const quiet = stats.every((r) => r.count === 0) && !pulse.mostDiscussed;

  return (
    <section aria-labelledby="community-pulse">
      <h3 id="community-pulse" className="px-2 text-body font-semibold text-primary">
        {pulse.hasPriorVisit ? "Since your last visit" : "This week"}
      </h3>

      {quiet ? (
        <p className="mt-1 px-2 text-body-sm text-secondary">{pulse.hasPriorVisit ? "You're caught up." : "No activity yet."}</p>
      ) : (
        <>
          {/* Numbers first, the way the home page states a fact: the figure large, what it counts beneath. */}
          <dl className="mt-3 grid grid-cols-3 gap-2 px-2">
            {stats.map((r) => (
              <div key={r.key} className="min-w-0">
                <dt className="sr-only">{r.label}</dt>
                <dd className={`text-title-md tabular ${r.count > 0 ? "text-primary" : "text-tertiary"}`}>{r.count}</dd>
                <dd className="truncate text-caption text-secondary">{r.label}</dd>
              </div>
            ))}
          </dl>
          {/* One named conversation to go and read; opens that post's discussion on its community page. */}
          {pulse.mostDiscussed && (
            <Link
              href={`${groupHref(pulse.mostDiscussed.groupId)}?post=${pulse.mostDiscussed.postId}`}
              className="mt-3 block rounded-control px-2 py-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span className="block text-caption text-secondary">
                Most discussed · <span className="tabular">{pulse.mostDiscussed.comments}</span> {pulse.mostDiscussed.comments === 1 ? "reply" : "replies"}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-body-sm text-primary">{pulse.mostDiscussed.excerpt}</span>
            </Link>
          )}
        </>
      )}
    </section>
  );
}
