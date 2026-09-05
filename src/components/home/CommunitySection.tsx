"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PostCard } from "@/app/groups/components/post/PostCard";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { groupHref } from "@/lib/routes";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import type { GroupSummary, PublicGroupSummary } from "@/lib/supabase/groups";

function formatActivityLabel(g: GroupSummary): string {
  if (g.weeklyPosts > 0) return `${g.weeklyPosts} post${g.weeklyPosts === 1 ? "" : "s"} this week`;
  if (g.myRank) return `Rank #${g.myRank}`;
  return `${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`;
}

export function CommunitySection({
  posts,
  groups,
  discoverGroups = [],
}: {
  posts: FeedPost[];
  groups: GroupSummary[];
  discoverGroups?: PublicGroupSummary[];
}) {
  const [searchQuery, setSearchQuery] = useState("");

  // Client-side filter of user's communities
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q)),
    );
  }, [groups, searchQuery]);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
            Community Command Center
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Real discussions, predictions, and active group standings
          </p>
        </div>
        <Link href="/groups" className="text-xs text-neutral-400 transition hover:text-white">
          Explore all groups →
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_360px]">
        {/* Left Panel: Latest Activity */}
        <div className="flex flex-col rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6 max-h-[680px]">
          <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300">
                Latest Community Activity
              </h3>
              <p className="text-[11px] text-neutral-500">
                Recent discourse and predictions from your paddock
              </p>
            </div>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-neutral-400">
              {posts.length} Active
            </span>
          </div>

          <div className="scrollbar-subtle flex-1 space-y-3 overflow-y-auto pr-1">
            {posts.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center">
                <p className="text-sm text-neutral-400">No community activity in the last 7 days.</p>
                <Link
                  href="/groups"
                  className="mt-2 text-xs font-medium text-[var(--f1-red)] hover:underline"
                >
                  Join or browse active groups →
                </Link>
              </div>
            ) : (
              posts.map((post, i) => (
                <PostCard key={post.id} post={post} index={i} showGroup />
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Your Communities */}
        <div className="flex flex-col rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6 max-h-[680px]">
          <div className="mb-3 border-b border-white/[0.06] pb-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300">
              Your Communities
            </h3>
            <p className="text-[11px] text-neutral-500">
              Your joined paddocks and competitive circles
            </p>
          </div>

          {/* Working Search Input */}
          {groups.length > 3 && (
            <div className="mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter your communities..."
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-white/30 focus:outline-none transition"
              />
            </div>
          )}

          {/* Community Cards List */}
          <div className="scrollbar-subtle flex-1 space-y-2.5 overflow-y-auto pr-1">
            {groups.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center">
                <p className="text-sm text-neutral-400">You haven&apos;t joined any groups yet.</p>
                {discoverGroups.length > 0 && (
                  <div className="mt-4 w-full space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                      Recommended groups:
                    </p>
                    {discoverGroups.slice(0, 3).map((g) => (
                      <Link
                        key={g.id}
                        href={groupHref(g.id)}
                        className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                      >
                        <EntityAvatar imageUrl={g.avatarUrl} name={g.name} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-white">{g.name}</p>
                          <p className="text-[10px] text-neutral-500">{g.memberCount} members</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : filteredGroups.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-500">
                No joined groups match &quot;{searchQuery}&quot;
              </p>
            ) : (
              filteredGroups.map((g) => (
                <Link
                  key={g.id}
                  href={groupHref(g.id)}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <EntityAvatar imageUrl={g.avatarUrl} name={g.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{g.name}</p>
                    <p className="truncate text-xs text-neutral-400">{formatActivityLabel(g)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <Link
              href="/groups"
              className="flex w-full items-center justify-center rounded-xl bg-white/[0.06] py-2 text-xs font-medium text-white transition hover:bg-white/[0.1]"
            >
              Explore All Groups →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CommunitySectionSkeleton() {
  return (
    <section>
      <Skeleton className="skeleton-shimmer h-4 w-44 rounded mb-4" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6 h-[400px]">
          <Skeleton className="skeleton-shimmer h-4 w-36 rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-24 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6 h-[400px]">
          <Skeleton className="skeleton-shimmer h-4 w-28 rounded mb-4" />
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-12 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
