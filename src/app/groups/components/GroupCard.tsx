"use client";

import Link from "next/link";
import { groupHref } from "@/lib/routes";
import type { GroupSummary } from "@/lib/supabase/groups";
import { GroupCardShell } from "./GroupCardShell";

const ROLE_LABEL: Record<GroupSummary["myRole"], string> = { admin: "Admin", moderator: "Moderator", member: "Member" };

/** The whole card is one Link (per the redesign's own "entire card clickable" ask) - hover is
 * restrained to a border brighten + the arrow nudging right; the banner itself never moves. */
export function GroupCard({ group, index }: { group: GroupSummary; index: number }) {
  return (
    <Link href={groupHref(group.id)} className="group block h-full">
      <GroupCardShell
        index={index}
        id={group.id}
        bannerUrl={group.bannerUrl}
        avatarUrl={group.avatarUrl}
        name={group.name}
        visibility={group.visibility}
        description={group.description}
        memberCount={group.memberCount}
        activePredictions={group.activePredictions}
        weeklyPosts={group.weeklyPosts}
        latestPost={group.latestPost}
        metaLine={
          <>
            <span className="text-neutral-400">{ROLE_LABEL[group.myRole]}</span>
            {group.myRank && <span>Rank #{group.myRank}</span>}
          </>
        }
        footer={
          <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-neutral-400 transition group-hover:text-white">
            View Group
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden>
              <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        }
      />
    </Link>
  );
}
