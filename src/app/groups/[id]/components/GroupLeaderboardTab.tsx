"use client";

import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { EmptyState, EmptyIcons } from "@/components/ui/EmptyState";
import type { LeaderboardRow } from "@/lib/supabase/groups";

/** Rank 1-3 only - a genuine podium tone (real motorsport convention, not a random three colors),
 * never further down the table where it would stop meaning anything. Applied to the rank number
 * only, not the whole row, so it reads as a subtle accent rather than a fourth visual system next
 * to "is this me". */
const PODIUM_TONE: Record<number, string> = { 1: "text-[#e8c866]", 2: "text-neutral-300", 3: "text-[#c98a4f]" };

/** The existing picks-based leaderboard (group_race_scores), unchanged in what it measures - just
 * restyled to match this redesign's own visual language and to subtly highlight the current
 * viewer's own row, per the request's own "highlight the current user, don't overwhelm" ask. No
 * rank-movement arrows (▲/▼) - that needs a *previous* rank snapshot this table has never stored
 * (group_race_scores is a live aggregate, not a per-round-frozen history), so a real arrow would
 * either be fabricated or need a new schema column to track - skipped rather than faked. Avatars
 * are the same EntityAvatar/initials-fallback treatment the Members tab's rows already use - this
 * table lists the same kind of entity and had been the one place in Communities that didn't. */
export function GroupLeaderboardTab({ rows, myUserId }: { rows: LeaderboardRow[]; myUserId: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={EmptyIcons.trophy} title="No scored races yet." description="Scores land here once a race a member picked finishes." />
    );
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
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${isMe ? "border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.06]" : "border-[var(--f1-line)] bg-[var(--f1-carbon)]/60"}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className={`w-5 shrink-0 text-right font-mono text-sm font-bold tabular-nums ${PODIUM_TONE[row.rank] ?? "text-neutral-500"}`}>{row.rank}</span>
              <EntityAvatar imageUrl={null} name={name} size={30} />
              <span className={`min-w-0 truncate font-medium ${isMe ? "text-white" : "text-neutral-200"}`}>{name}</span>
              {isMe && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--f1-red)]">You</span>}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono font-semibold text-white">{row.totalScore} pts</p>
              <p className="text-xs text-neutral-500">
                {row.racesScored} race{row.racesScored === 1 ? "" : "s"}
              </p>
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}
