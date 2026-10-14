"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MessageSquare, Reply, Sparkles, TrendingUp } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { groupHref } from "@/lib/routes";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";
import type { GroupSummary } from "@/lib/supabase/groups";

export type NextRace = { year: number; round: number; name: string; raceDate: string | null; country: string | null; circuit: string | null; photoUrl: string | null } | null;

/**
 * A real, computed digest - not a live model call. Every number here (weeklyPosts,
 * activePredictions) is already sitting on the `groups` prop this page fetches with getUserGroups,
 * itself real (group_posts/group_predictions counts, see groupActivitySignals) - so this reuses the
 * exact same data Ask Apex's own community-index grounding builder answers from, rather than
 * standing up a second, parallel "AI summary" endpoint that fires unprompted on every homepage
 * load. Framed as Apex's own digest (its accent mark, its name) because it IS Apex's data - just
 * rendered directly instead of paraphrased through a model call nobody asked a question of yet.
 * Genuinely quiet communities get the honest "no major changes" state, never a manufactured one.
 */
export function CommunityPulse({ groups, pulse }: { groups: GroupSummary[]; pulse: CommunityPulseData }) {
  const weeklyPosts = groups.reduce((sum, g) => sum + g.weeklyPosts, 0);
  const openPredictions = groups.reduce((sum, g) => sum + g.activePredictions, 0);
  const weeklyMostActive = groups.reduce<GroupSummary | null>((best, g) => (g.weeklyPosts > 0 && (!best || g.weeklyPosts > best.weeklyPosts) ? g : best), null);

  // Two genuinely different digests, and which one shows depends on whether there IS a previous
  // visit to diff against - not on which reads better. A returning viewer gets the delta since they
  // were last here; a first-time one gets the standing picture, because "nothing has changed since
  // your last visit" would be a claim about a visit that never happened.
  //
  // Every row is {count, label} rather than a sentence: the number is the thing being scanned, so
  // it gets the weight and a column of its own, and rows with a zero count are dropped entirely
  // rather than rendered as "0 new discussions".
  const rows = pulse.hasPriorVisit
    ? [
        { key: "posts", tone: "sky" as const, icon: <Icon icon={MessageSquare} size={16} className="size-3" />, count: pulse.newPosts, label: pulse.newPosts === 1 ? "new discussion" : "new discussions" },
        { key: "replies", tone: "emerald" as const, icon: <Icon icon={Reply} size={16} className="size-3" />, count: pulse.repliesToYou, label: pulse.repliesToYou === 1 ? "reply to your posts" : "replies to your posts" },
        { key: "entries", tone: "amber" as const, icon: <Icon icon={TrendingUp} size={16} className="size-3" />, count: pulse.newPredictionEntries, label: pulse.newPredictionEntries === 1 ? "new prediction entry" : "new prediction entries" },
      ].filter((r) => r.count > 0)
    : [
        { key: "posts", tone: "sky" as const, icon: <Icon icon={MessageSquare} size={16} className="size-3" />, count: weeklyPosts, label: weeklyPosts === 1 ? "discussion this week" : "discussions this week" },
        { key: "open", tone: "amber" as const, icon: <Icon icon={TrendingUp} size={16} className="size-3" />, count: openPredictions, label: openPredictions === 1 ? "open prediction" : "open predictions" },
      ].filter((r) => r.count > 0);

  const trending = pulse.hasPriorVisit ? pulse.mostActive : weeklyMostActive ? { id: weeklyMostActive.id, name: weeklyMostActive.name } : null;

  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-body-sm font-semibold text-primary">
        <Icon icon={Sparkles} size={16} className="text-tertiary" />
        Community pulse
      </h3>
      <p className="mt-0.5 text-caption text-tertiary">{pulse.hasPriorVisit ? "Since you were last here" : "Across your communities"}</p>

      {rows.length === 0 && !trending && !pulse.mostDiscussed && !pulse.predictionPulse ? (
        <p className="mt-3 text-caption text-secondary">
          {pulse.hasPriorVisit ? "You're caught up. No major changes since your last visit." : "No activity across your communities yet."}
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="mt-3 space-y-2">
              {/* Staggered, not all at once: the rows are a short list of counts, and letting
                  them arrive in order is what makes the widget read as being filled in rather
                  than as having always been there. 40ms apart - enough to see, not enough to
                  wait for. */}
              {rows.map((r, i) => (
                <motion.li
                  key={r.key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: i * 0.04 }}
                  className="flex items-center gap-2"
                >
                  <span aria-hidden className={`flex size-6 shrink-0 items-center justify-center rounded-control ${TONE[r.tone]}`}>
                    {r.icon}
                  </span>
                  <span className="text-body-sm font-semibold tabular text-primary">{r.count}</span>
                  <span className="min-w-0 flex-1 truncate text-caption text-secondary">{r.label}</span>
                </motion.li>
              ))}
              {trending && (
                <motion.li
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: rows.length * 0.04 }}
                  className="flex items-center gap-2"
                >
                  <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-control bg-surface-3 text-secondary">
                    <Icon icon={TrendingUp} size={16} className="size-3" />
                  </span>
                  <Link href={groupHref(trending.id)} className="min-w-0 flex-1 truncate text-caption text-secondary underline-offset-2 hover:text-primary hover:underline">
                    {trending.name} is trending
                  </Link>
                </motion.li>
              )}
            </ul>
          )}

          {/* Named, not counted: the widget points at one real conversation to go and read. The
              link opens that post's own discussion on its community page. */}
          {pulse.mostDiscussed && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: (rows.length + 1) * 0.04 }}>
            <Link href={`${groupHref(pulse.mostDiscussed.groupId)}?post=${pulse.mostDiscussed.postId}`} className="mt-3 block border-t border-white/10 pt-3 transition-opacity duration-fast hover:opacity-80">
              <p className="text-caption text-tertiary">Most discussed</p>
              <p className="mt-0.5 line-clamp-2 text-body-sm text-primary">{pulse.mostDiscussed.excerpt}</p>
              <p className="mt-0.5 text-caption tabular text-tertiary">
                {pulse.mostDiscussed.comments} {pulse.mostDiscussed.comments === 1 ? "reply" : "replies"}
              </p>
            </Link>
            </motion.div>
          )}

          {/* A real split from real entries - the leading pick and its actual share, only once
              enough people have entered for that to mean anything. */}
          {pulse.predictionPulse && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: (rows.length + 2) * 0.04 }}>
            <Link href={`${groupHref(pulse.predictionPulse.groupId)}?tab=predictions`} className="mt-3 block border-t border-white/10 pt-3 transition-opacity duration-fast hover:opacity-80">
              <p className="text-caption text-tertiary">Prediction activity</p>
              <p className="mt-0.5 text-body-sm text-secondary">
                <span className="font-semibold text-primary">{pulse.predictionPulse.pct}%</span> backing {pulse.predictionPulse.leader}
              </p>
              {/* The share, drawn - the same bar language the prediction cards in the feed use,
                  so "62% backing Norris" is something you can see the size of rather than only
                  read. It grows from zero on arrival, which is the motion this widget was
                  missing entirely. */}
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-surface-3" role="presentation">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${pulse.predictionPulse.pct}%` }}
                  transition={{ duration: 0.5, ease: [0.2, 0, 0, 1], delay: (rows.length + 2) * 0.04 + 0.1 }}
                  className="block h-full rounded-full bg-primary/80"
                />
              </span>
              <p className="mt-1 truncate text-caption text-tertiary">
                {pulse.predictionPulse.raceName} · {pulse.predictionPulse.total} entries
              </p>
            </Link>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

/** Restrained, fixed tones - one per kind of activity, so a row is identifiable by its colour
 * without the widget turning into a palette. */
const TONE = {
  sky: "bg-sky-500/[0.14] text-sky-400",
  emerald: "bg-emerald-500/[0.14] text-emerald-400",
  amber: "bg-amber-500/[0.14] text-amber-400",
} as const;
