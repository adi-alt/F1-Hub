"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { LeaderboardRow } from "@/lib/supabase/groups";

/** The existing picks-based leaderboard (group_race_scores), unchanged in what it measures - just
 * restyled to match this redesign's own visual language and to subtly highlight the current
 * viewer's own row, per the request's own "highlight the current user, don't overwhelm" ask. No
 * rank-movement arrows (▲/▼) - that needs a *previous* rank snapshot this table has never stored
 * (group_race_scores is a live aggregate, not a per-round-frozen history), so a real arrow would
 * either be fabricated or need a new schema column to track - skipped rather than faked. */
export function GroupLeaderboardTab({ rows, myUserId }: { rows: LeaderboardRow[]; myUserId: string }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-6 text-center text-sm text-neutral-500">No scored races yet - scores land here once a race a member picked finishes.</p>;
  }

  return (
    <motion.ol initial="hidden" animate="show" variants={staggerContainer} className="space-y-1.5">
      {rows.map((row) => {
        const isMe = row.userId === myUserId;
        return (
          <motion.li
            key={row.userId}
            variants={staggerItem}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${isMe ? "border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.06]" : "border-[var(--f1-line)] bg-[var(--f1-carbon)]/60"}`}
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-sm font-semibold text-neutral-500">#{row.rank}</span>
              <span className={`font-medium ${isMe ? "text-white" : "text-neutral-200"}`}>{row.displayName ?? row.username ?? "Member"}</span>
              {isMe && <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--f1-red)]">You</span>}
            </div>
            <div className="text-right">
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
