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
export function PostHeader({
  post,
  showGroup,
  roleLabel,
  pending,
}: {
  post: PostCardData;
  showGroup: boolean;
  /** ADMIN/MODERATOR, when the author holds one. */
  roleLabel?: string;
  pending?: boolean;
}) {
  const { user } = useAuth();
  const isMe = !!user && user.uid === post.userId;
  const authorAvatarUrl = isMe ? (user.photoURL ?? null) : null;
  const inCommunity = showGroup && !!post.groupId;

  const author = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption leading-tight text-tertiary">
      <span className="min-w-0 truncate font-medium text-secondary">
        {post.authorName}
      </span>
      <span aria-hidden className="text-tertiary">
        ·
      </span>
      <span className="shrink-0 whitespace-nowrap">{timeAgo(post.createdAt)}</span>
      {roleLabel && <Badge tone="neutral">{roleLabel}</Badge>}
      {pending && <Badge tone="warning">Pending approval</Badge>}
    </span>
  );

  // The avatar always belongs to whichever identity leads the post, never to the other one.
  const avatar = inCommunity ? (
    <Link href={groupHref(post.groupId as string)} className="shrink-0">
      <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Community"} seed={post.groupId ?? undefined} size={36} />
    </Link>
  ) : (
    <EntityAvatar imageUrl={authorAvatarUrl} name={post.authorName} seed={post.userId} size={36} />
  );

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {inCommunity ? (
          <>
            <Link href={groupHref(post.groupId as string)} className="min-w-0 truncate text-body-sm font-semibold leading-tight text-primary transition-colors duration-fast hover:text-secondary">
              {post.groupName}
            </Link>
            {author}
          </>
        ) : (
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-body-sm leading-tight">
            <span className="min-w-0 truncate font-semibold text-primary">
              {post.authorName}
            </span>
            <span aria-hidden className="text-tertiary">
              ·
            </span>
            <span className="shrink-0 whitespace-nowrap text-caption text-tertiary">{timeAgo(post.createdAt)}</span>
            {roleLabel && <Badge tone="neutral">{roleLabel}</Badge>}
            {pending && <Badge tone="warning">Pending approval</Badge>}
          </span>
        )}
      </div>
    </div>
  );
}
