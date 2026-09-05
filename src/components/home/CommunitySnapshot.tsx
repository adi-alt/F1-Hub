"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";

const GROUPS_SHOWN = 5;

// Every signal here is real (weeklyPosts/myRank/memberCount, straight off GroupSummary — see
// groups.ts's own groupActivitySignals doc comment on why there's no fabricated "unread" count),
// picked in the order that's most likely to be worth clicking for.
function activityLabel(g: GroupSummary): string {
  if (g.weeklyPosts > 0) return `${g.weeklyPosts} post${g.weeklyPosts === 1 ? "" : "s"} this week`;
  if (g.myRank) return `You're #${g.myRank}`;
  return `${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`;
}

/** A compact horizontal set of the user's own groups — real activity signals GroupSummary already
 * computes, not a second Groups implementation. */
export function CommunitySnapshot({ groups }: { groups: GroupSummary[] }) {
  if (groups.length === 0) return null;

  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={staggerContainer} className="flex gap-3 overflow-x-auto pb-1">
      {groups.slice(0, GROUPS_SHOWN).map((g) => (
        <motion.div key={g.id} variants={staggerItem}>
          <Link
            href={groupHref(g.id)}
            className="flex min-w-[180px] items-center gap-3 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5 transition hover:border-white/30"
          >
            <EntityAvatar imageUrl={g.avatarUrl} name={g.name} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{g.name}</p>
              <p className="truncate text-xs text-neutral-500">{activityLabel(g)}</p>
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function CommunitySnapshotSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="skeleton-shimmer h-16 min-w-[180px] rounded-xl" />
      ))}
    </div>
  );
}
