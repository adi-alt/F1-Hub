"use client";

import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LeaderboardRow } from "@/lib/supabase/groups";

/** Rank 1-3 only - a genuine podium tone (real motorsport convention, not a random three colors),
 * never further down the table where it would stop meaning anything. Applied to the rank number
 * only, not the whole row, so it reads as a subtle accent rather than a fourth visual system next
 * to "is this me". */
const PODIUM_TONE: Record<number, string> = { 1: "text-[#e8c866]", 2: "text-secondary", 3: "text-[#c98a4f]" };

/** The existing picks-based leaderboard (group_race_scores), unchanged in what it measures - just
 * restyled to match this redesign's own visual language and to subtly highlight the current
 * viewer's own row, per the request's own "highlight the current user, don't overwhelm" ask. No
 * rank-movement arrows (▲/▼) - that needs a *previous* rank snapshot this table has never stored
 * (group_race_scores is a live aggregate, not a per-round-frozen history), so a real arrow would
 * either be fabricated or need a new schema column to track - skipped rather than faked. Avatars
 * are the same EntityAvatar/initials-fallback treatment the Members tab's rows already use - this
 * table lists the same kind of entity and had been the one place in Communities that didn't. */
export function GroupLeaderboardTab({ rows, myUserId, avatars }: { rows: LeaderboardRow[]; myUserId: string; avatars?: Record<string, string | null> }) {
  if (rows.length === 0) {
    return <EmptyState icon={Trophy} message="No scored races yet: scores land here once a race a member picked finishes." />;
  }

  return (
    <motion.ol initial="hidden" animate="show" variants={staggerContainer} className="space-y-1.5">
      {rows.map((row) => {
        const isMe = row.userId === myUserId;
        const name = row.displayName ?? row.username ?? "Member";
        return (
          <motion.li
            key={row.userId}
            variants={staggerItem}
            className={`flex items-center justify-between rounded-control border px-4 py-3 ${isMe ? "border-white/20 bg-white/[0.05]" : "border-white/[0.06] bg-white/[0.012]"}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className={`w-5 shrink-0 text-right font-mono text-body-sm font-bold tabular ${PODIUM_TONE[row.rank] ?? "text-tertiary"}`}>{row.rank}</span>
              <EntityAvatar imageUrl={avatars?.[row.userId] ?? null} name={name} seed={row.userId} size={30} />
              <span className={`min-w-0 truncate font-medium ${isMe ? "text-primary" : "text-secondary"}`}>{name}</span>
              {isMe && <span className="shrink-0 text-caption font-semibold text-brand-text">You</span>}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono font-semibold text-white">{row.totalScore} pts</p>
              <p className="text-xs text-tertiary">
                {row.racesScored} race{row.racesScored === 1 ? "" : "s"}
              </p>
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}
