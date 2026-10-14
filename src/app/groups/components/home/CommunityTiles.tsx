"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Medal, Trophy } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { compactCount, timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import { GroupBanner } from "../GroupBanner";

const ROLE: Record<string, string> = { admin: "Admin", moderator: "Moderator", member: "Member" };

/**
 * Your communities as cards rather than a list of names: each one's cover and avatar, how big it is and your role,
 * where you stand on its leaderboard, how many prediction rounds are open, and the last thing said there. The card
 * opens the community. A new card at the end starts another.
 */
export function CommunityTiles({ groups, onCreate }: { groups: GroupSummary[]; onCreate: () => void }) {
  return (
    <section aria-labelledby="your-communities" data-tour="community-list">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="your-communities" className="text-title-lg text-primary">
          Your communities
        </h2>
        <p className="text-body-sm text-secondary">
          {groups.length} communit{groups.length === 1 ? "y" : "ies"}
        </p>
      </div>
      <ul className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
        {groups.map((g, i) => (
          <motion.li key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.05, ease: [0.2, 0, 0, 1] }} className="w-[80%] min-w-0 shrink-0 snap-start sm:w-auto">
            <Tile g={g} />
          </motion.li>
        ))}
        <li className="w-[80%] shrink-0 snap-start sm:w-auto">
          <button
            type="button"
            onClick={onCreate}
            className="flex h-full min-h-56 w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-white/15 p-6 text-center transition-colors duration-fast hover:border-white/30 hover:bg-surface-1/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-xl text-secondary">+</span>
            <span className="text-body-sm font-medium text-primary">Start a community</span>
            <span className="text-caption text-secondary">A league for friends, with its own rounds</span>
          </button>
        </li>
      </ul>
    </section>
  );
}

function Tile({ g }: { g: GroupSummary }) {
  return (
    <Link
      href={groupHref(g.id)}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-white/10 bg-surface-1/70 transition-[border-color,transform] duration-base hover:-translate-y-0.5 hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:hover:translate-y-0"
    >
      <GroupBanner bannerUrl={g.bannerUrl} seed={g.id} />
      <div className="flex flex-1 flex-col px-4 pb-4">
        <div className="-mt-6 flex items-end justify-between gap-2">
          <span className="relative z-10 rounded-full ring-4 ring-surface-1">
            <EntityAvatar imageUrl={g.avatarUrl} name={g.name} seed={g.id} size={44} />
          </span>
          {g.activePredictions > 0 && (
            <span className="relative z-10 mb-1 flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-caption font-medium text-primary">
              <Icon icon={Trophy} size={16} className="size-3.5 text-secondary" />
              {g.activePredictions} open
            </span>
          )}
        </div>
        <p className="mt-2.5 line-clamp-1 text-body font-semibold text-primary">{g.name}</p>
        <p className="text-caption text-secondary">
          {compactCount(g.memberCount)} member{g.memberCount === 1 ? "" : "s"} · {ROLE[g.myRole] ?? "Member"}
        </p>

        <div className="mt-3 flex items-center gap-1.5 text-caption">
          <Icon icon={Medal} size={16} className="text-tertiary" />
          {g.myRank ? (
            <span className="text-secondary">
              You&apos;re <span className="font-semibold tabular text-primary">#{g.myRank}</span>
              {g.leader && g.myRank !== 1 ? ` · ${g.leader.name} leads` : ""}
            </span>
          ) : (
            <span className="text-tertiary">No scored rounds yet</span>
          )}
        </div>

        <div className="mt-3 flex-1 border-t border-white/10 pt-3">
          {g.latestPost ? (
            <p className="line-clamp-2 text-caption text-secondary">
              <span className="font-medium text-primary">{g.latestPost.authorName}:</span> {g.latestPost.content}
              <span className="text-tertiary"> · {timeAgo(g.latestPost.createdAt)}</span>
            </p>
          ) : (
            <p className="text-caption text-tertiary">Quiet so far. Start the conversation.</p>
          )}
        </div>
        <span className="mt-3 flex items-center gap-1 text-caption font-medium text-secondary transition-colors duration-fast group-hover:text-primary">
          Open <Icon icon={ArrowRight} size={16} className="transition-transform duration-fast group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
