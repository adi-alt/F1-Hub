"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { compactCount, timeAgo } from "@/lib/format";
import type { LatestPost } from "@/lib/supabase/groups";
import { GroupBanner } from "./GroupBanner";

/** The body every group card shares (My Groups and Discover alike) - banner, icon overlap, name +
 * visibility badge, description, real member/activity signals, a latest-post preview when one
 * exists. Only the wrapper (a full-card Link vs a plain div with its own Join button) and the
 * bottom CTA differ, so those are the two things left to the caller. */
export function GroupCardShell({
  index,
  id,
  bannerUrl,
  avatarUrl,
  name,
  visibility,
  description,
  memberCount,
  metaLine,
  activePredictions,
  weeklyPosts,
  latestPost,
  footer,
}: {
  index: number;
  id: string;
  bannerUrl: string | null;
  avatarUrl: string | null;
  name: string;
  visibility: "public" | "private";
  description: string | null;
  memberCount: number;
  /** Role + rank, or whatever else the caller wants next to the member count. */
  metaLine?: ReactNode;
  activePredictions: number;
  weeklyPosts: number;
  latestPost: LatestPost | null;
  footer: ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }} className="h-full">
      {/* The hover lift/border-glow lives on this plain div, not the motion.div above - framer
          sets its own inline transform for the entrance animation, which would otherwise fight a
          Tailwind `group-hover:-translate-y` class on the same element (inline style always wins,
          so the hover transform would silently never apply). */}
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-white/20">
        <GroupBanner bannerUrl={bannerUrl} seed={id} />
        <div className="flex flex-1 flex-col px-4 pb-4">
          <div className="-mt-6 flex items-end justify-between">
            <div className="rounded-full ring-4 ring-[var(--f1-carbon)]">
              <EntityAvatar imageUrl={avatarUrl} name={name} size={48} />
            </div>
            <span className="mb-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{visibility === "public" ? "Public" : "Private"}</span>
          </div>

          <p className="mt-2.5 truncate font-semibold text-white">{name}</p>
          {description && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{description}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span>
              {compactCount(memberCount)} member{memberCount === 1 ? "" : "s"}
            </span>
            {metaLine}
          </div>

          {(activePredictions > 0 || weeklyPosts > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
              {activePredictions > 0 && <span>🏁 {activePredictions} active prediction{activePredictions === 1 ? "" : "s"}</span>}
              {weeklyPosts > 0 && <span>💬 {weeklyPosts} post{weeklyPosts === 1 ? "" : "s"} this week</span>}
            </div>
          )}

          <div className="mt-auto">
            {latestPost && (
              <p className="mt-3 truncate border-t border-[var(--f1-line)] pt-3 text-xs text-neutral-500">
                <span className="text-neutral-400">Latest:</span> &ldquo;{latestPost.content}&rdquo; <span className="text-neutral-600">· {timeAgo(latestPost.createdAt)}</span>
              </p>
            )}
            {!latestPost && activePredictions === 0 && weeklyPosts === 0 && <p className="mt-3 border-t border-[var(--f1-line)] pt-3 text-xs text-neutral-600">No activity yet</p>}
            {footer}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
