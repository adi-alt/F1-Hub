"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { GroupActivity, GroupSummary } from "@/lib/supabase/groups";
import { GroupBanner } from "./GroupBanner";

const ROLE_LABEL: Record<GroupSummary["myRole"], string> = { admin: "Admin", moderator: "Moderator", member: "Member" };

function activityLine(activity: GroupActivity | null): string | null {
  if (!activity) return null;
  if (activity.type === "post") return `${activity.authorName} posted ${timeAgo(activity.createdAt)}`;
  return `${activity.count} active prediction${activity.count === 1 ? "" : "s"}`;
}

/** Banner up top (real image or a deterministic gradient - see GroupBanner), the icon overlapping
 * its bottom edge, then name/description/metadata/activity - the full hierarchy the redesign asked
 * for, still one clickable card. Hover is deliberately restrained (a 2px lift + border brighten +
 * the arrow nudging right) - the banner itself never moves or reflows on hover, per the request's
 * own "banner remains static" note. */
export function GroupCard({ group, index }: { group: GroupSummary; index: number }) {
  const activity = activityLine(group.activity);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}>
      <Link
        href={groupHref(group.id)}
        className="group block overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20"
      >
        <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} height={100} />

        <div className="px-4 pb-4">
          <div className="-mt-6 flex items-end justify-between">
            <div className="rounded-full ring-4 ring-[var(--f1-carbon)]">
              <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={48} />
            </div>
            <span className="mb-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{group.visibility === "public" ? "Public" : "Private"}</span>
          </div>

          <p className="mt-2.5 truncate font-semibold text-white">{group.name}</p>
          {group.description && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{group.description}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            <span>
              {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
            </span>
            <span className="text-neutral-400">{ROLE_LABEL[group.myRole]}</span>
            {group.myRank && <span>Rank #{group.myRank}</span>}
          </div>

          {activity && (
            <p className="mt-3 truncate border-t border-[var(--f1-line)] pt-3 text-xs text-neutral-400">
              {activity}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-neutral-400 transition group-hover:text-white">
            View
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden>
              <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
