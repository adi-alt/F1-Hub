"use client";

import { Button } from "@/components/ui/Button";
import { PANEL_INTERACTIVE } from "@/components/ui/panel";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { compactCount, timeAgo } from "@/lib/format";
import { communityTypeMeta, visibilityLabel } from "@/lib/communities";
import type { PublicGroupSummary } from "@/lib/supabase/groups";
import { GroupBanner } from "./GroupBanner";
import { groupHref } from "@/lib/routes";

/**
 * The one community card. Replaces GroupCardShell's "render every signal for every community"
 * approach with a single *chosen* headline signal, because the explicit ask was cards that give a
 * real reason to interact without being overloaded.
 *
 * Which signal gets the headline depends on what's actually true, checked in priority order:
 *
 *   1. an open prediction round   - the most time-sensitive thing a community can have
 *   2. posts in the last 7 days   - live conversation
 *   3. a latest post              - dormant but not empty
 *   4. nothing                    - said plainly, never dressed up
 *
 * So a Prediction League leads with its round and a Photography community leads with its
 * discussion, out of one component and with no per-type branching at the call site.
 */
export function CommunityCard({
  community,
  index = 0,
  onJoined,
}: {
  community: PublicGroupSummary;
  index?: number;
  onJoined?: (id: string) => void;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const meta = communityTypeMeta(community.communityType);
  const href = groupHref(community.id);

  async function join(e: React.MouseEvent) {
    // The card is a link; the join button sits inside it. Without this, joining also navigates
    // via the anchor and the two race each other.
    e.preventDefault();
    e.stopPropagation();
    setJoining(true);
    setError("");
    const res = await fetch(`/api/groups/${community.id}/join`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      // The server's reason (banned, private) is the useful one; "try again" only fits a failed connection.
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't join. Check your connection and try again.");
      setJoining(false);
      return;
    }
    onJoined?.(community.id);
    router.push(href);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="h-full"
    >
      {/* The card is one link (the name, stretched over it) with Join as its own button on top: a button inside a
          link is invalid and reads to a screen reader as one long link. */}
      <div className="group relative h-full">
        {/* Hover lift lives on this inner div, not the motion.div - framer owns the outer element's
            transform for the entrance animation and a Tailwind translate class there would silently
            never apply (inline style wins). */}
        <div className={`flex h-full flex-col overflow-hidden transition-transform duration-base group-hover:-translate-y-0.5 ${PANEL_INTERACTIVE}`}>
          <GroupBanner bannerUrl={community.bannerUrl} seed={community.id} />

          <div className="flex flex-1 flex-col px-4 pb-4">
            <div className="-mt-6 flex items-end justify-between gap-2">
              <span className="relative z-10 rounded-full ring-4 ring-surface-1">
                <EntityAvatar imageUrl={community.avatarUrl} name={community.name} size={44} />
              </span>
              {community.isMember && (
                <span className="mb-1 shrink-0 rounded-control border border-white/15 px-2 py-0.5 text-caption font-semibold text-secondary">
                  Joined
                </span>
              )}
            </div>

            {/* line-clamp, not truncate - an extremely long name should wrap to two lines and stop,
                not silently lose most of itself to an ellipsis. */}
            <Link
              href={href}
              className="mt-2.5 line-clamp-2 rounded-control text-body font-semibold leading-tight text-primary after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-focus-ring"
            >
              {community.name}
            </Link>

            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-tertiary">
              <span>{meta.label}</span>
              {community.topic && (
                <>
                  <span aria-hidden>·</span>
                  <span>{community.topic}</span>
                </>
              )}
              {/* Always "Public": discovery only ever returns visibility='public' communities
                  (discoverCommunities' own doc comment), so reading a field off the row would be
                  implying a variation that can't occur here. */}
              <span aria-hidden>·</span>
              <span>{visibilityLabel("public")}</span>
            </p>

            {community.description && <p className="mt-2 line-clamp-2 text-caption text-tertiary">{community.description}</p>}

            <p className="mt-2.5 text-caption text-secondary">
              {compactCount(community.memberCount)} member{community.memberCount === 1 ? "" : "s"}
            </p>

            <div className="mt-auto pt-3">
              <CommunitySignal community={community} />

              {community.isMember ? (
                <span className="mt-3 flex items-center justify-end gap-1 text-caption font-medium text-secondary transition-colors duration-fast group-hover:text-primary">
                  Open
                  <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden>
                    <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : (
                <>
                  <Button variant="secondary" size="sm" className="relative z-10 mt-3 w-full" onClick={join} loading={joining}>
                    {community.activePredictions > 0 ? "Join and predict" : "Join"}
                  </Button>
                  {error && <p role="alert" className="relative z-10 mt-1.5 text-center text-caption text-danger">{error}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** The single headline signal. One line, one reason, never a row of competing counters. */
function CommunitySignal({ community }: { community: PublicGroupSummary }) {
  if (community.activePredictions > 0) {
    return (
      <p className="flex items-center gap-1.5 border-t border-white/[0.06] pt-3 text-caption text-primary">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
        {community.activePredictions} {community.activePredictions === 1 ? "round" : "rounds"} open now
      </p>
    );
  }
  if (community.weeklyPosts > 0) {
    return (
      <p className="flex items-center gap-1.5 border-t border-white/[0.06] pt-3 text-caption text-secondary">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
        {community.weeklyPosts} discussion{community.weeklyPosts === 1 ? "" : "s"} this week
      </p>
    );
  }
  if (community.latestPost) {
    return (
      <p className="border-t border-white/[0.06] pt-3 text-caption text-tertiary">
        <span className="line-clamp-1">&ldquo;{community.latestPost.content}&rdquo;</span>
        <span className="text-tertiary">{timeAgo(community.latestPost.createdAt)}</span>
      </p>
    );
  }
  // Said plainly. A brand-new community with one member is a real state, and pretending otherwise
  // is how fake activity indicators get born.
  return <p className="border-t border-white/[0.06] pt-3 text-caption text-tertiary">No activity yet - be the first to post</p>;
}
