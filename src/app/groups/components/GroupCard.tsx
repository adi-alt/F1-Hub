"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";

const ROLE_LABEL: Record<GroupSummary["myRole"], string> = { admin: "Admin", moderator: "Moderator", member: "Member" };

/** Everything the request's own mockup asked for in one glance - icon, name, description, a
 * public/private tag, member count, this group's own picks-leaderboard rank (not the wallet
 * balance - see GroupSummary's own comment on why those are different numbers), the group's
 * current leader, and how many predictions are open right now. Hover state is a small border/
 * background lift + the arrow nudging right - `group` (the Tailwind variant, not this page's own
 * "group" noun) makes the arrow react to hovering the whole card, not just itself. */
export function GroupCard({ group, index }: { group: GroupSummary; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
    >
      <Link
        href={groupHref(group.id)}
        className="group block rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[var(--f1-carbon)]/80"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{group.name}</p>
              {group.description && <p className="mt-0.5 truncate text-xs text-neutral-500">{group.description}</p>}
            </div>
          </div>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{group.visibility === "public" ? "Public" : "Private"}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span>
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </span>
          <span>
            {group.activePredictions} active prediction{group.activePredictions === 1 ? "" : "s"}
          </span>
          <span className="text-neutral-400">{ROLE_LABEL[group.myRole]}</span>
          {group.myRank && <span>Your rank #{group.myRank}</span>}
        </div>

        {group.leader && (
          <div className="mt-3 flex items-center justify-between border-t border-[var(--f1-line)] pt-3 text-xs">
            <span className="text-neutral-500">
              🏆 Leader: <span className="text-neutral-300">{group.leader.name}</span>
            </span>
            <span className="font-mono text-neutral-300">{group.leader.totalScore} pts</span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-neutral-400 transition group-hover:text-white">
          View
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden>
            <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </Link>
    </motion.div>
  );
}
