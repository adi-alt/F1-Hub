"use client";

import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { PostCardData } from "./types";

/**
 * One avatar, two lines of context.
 *
 * A post in a community has two facts worth stating - where it lives and who wrote it - but only
 * ONE of them owns the post's identity, and that's the one that gets the avatar:
 *
 *   [community pfp]  Ferrari Tifosi Hub
 *                    Aditya Verma · 2h ago · Admin
 *
 * A personal post has no community, so it gets the author's avatar and the author line alone -
 * nothing is invented to sit above it:
 *
 *   [user pfp]  Sneha Iyer · 8h ago
 *
 * The earlier version of this stacked TWO avatars, which made the header taller than the post it
 * introduced. One avatar plus a quiet second line carries the same information in roughly half the
 * height, which is the whole point.
 *
 * Author avatar: `profiles` has no avatar_url column anywhere in this app (traced - the only
 * per-user photo this product has is `session.photoURL`, an OAuth avatar captured into the session
 * at sign-in, see createSession.ts; it's never written back to a table a post-authors query could
 * join against). So there's a real photo for exactly one author on any screen - the viewer's own
 * posts - and that's the one case this uses it for. Every other author falls through to
 * EntityAvatar's deterministic initials, because no real photo for them exists to show.
 */
type HeaderProps = {
  post: PostCardData;
  showGroup: boolean;
  /** Admin/Moderator, when the author holds one. */
  roleLabel?: string;
  pending?: boolean;
};

/** Whose post this is at a glance: the community's avatar in the cross-community feed, the author's inside a
 * community. In the feed card it sits in a column of its own, with the post indented beside it. */
export function PostAvatar({ post, showGroup, size = 40 }: Pick<HeaderProps, "post" | "showGroup"> & { size?: number }) {
  const { user } = useAuth();
  const isMe = !!user && user.uid === post.userId;
  if (showGroup && post.groupId) {
    return (
      <Link href={groupHref(post.groupId)} className="shrink-0 rounded-full transition-opacity duration-fast hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring" aria-label={post.groupName ?? "Community"}>
        <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Community"} seed={post.groupId} size={size} />
      </Link>
    );
  }
  return <EntityAvatar imageUrl={post.authorAvatarUrl ?? (isMe ? (user.photoURL ?? null) : null)} name={post.authorName} seed={post.userId} size={size} />;
}

/** One line of who and when: the community (bold, a link) and the author, or the author alone inside a community,
 * then how long ago, then the author's role and a pending state as badges. It wraps on a narrow screen. */
export function PostByline({ post, showGroup, roleLabel, pending }: HeaderProps) {
  const inCommunity = showGroup && !!post.groupId;
  const dot = (
    <span aria-hidden className="text-tertiary">
      ·
    </span>
  );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-body-sm leading-5">
      {inCommunity ? (
        <>
          <Link href={groupHref(post.groupId as string)} className="min-w-0 truncate font-semibold text-primary underline-offset-2 hover:underline">
            {post.groupName}
          </Link>
          {dot}
          <span className="flex min-w-0 items-center gap-1.5 text-secondary">
            {post.authorAvatarUrl && <EntityAvatar imageUrl={post.authorAvatarUrl} name={post.authorName} seed={post.userId} size={16} />}
            <span className="truncate">{post.authorName}</span>
          </span>
        </>
      ) : (
        <span className="min-w-0 truncate font-semibold text-primary">{post.authorName}</span>
      )}
      {dot}
      <time suppressHydrationWarning dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()} className="shrink-0 whitespace-nowrap text-tertiary">
        {timeAgo(post.createdAt)}
      </time>
      {roleLabel && <Badge tone="neutral">{roleLabel}</Badge>}
      {pending && <Badge tone="warning">Pending approval</Badge>}
    </div>
  );
}

/** The avatar and the byline side by side: the discussion window's header (the feed card lays them out itself). */
export function PostHeader({ post, showGroup, roleLabel, pending }: HeaderProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <PostAvatar post={post} showGroup={showGroup} size={36} />
      <div className="min-w-0 flex-1">
        <PostByline post={post} showGroup={showGroup} roleLabel={roleLabel} pending={pending} />
      </div>
    </div>
  );
}
