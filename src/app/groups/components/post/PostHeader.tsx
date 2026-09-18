"use client";

import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { PostCardData } from "./types";

/**
 * One line, one avatar, one identity.
 *
 * A post has two identities available - the community it lives in and the person who wrote it -
 * and showing both as equals is what made this header feel cramped. Whichever one actually
 * anchors the post in its context is the one that gets the avatar and the name:
 *
 *  - in the cross-community home feed, a post that belongs to a community is anchored by the
 *    COMMUNITY: [community pfp] C/{name}
 *  - a personal post, or any post inside a community's own Feed tab (where the page itself already
 *    says which community this is), is anchored by the AUTHOR: [author pfp] U/{name}
 *
 * The `C/` and `U/` prefixes say which kind of identity is showing without relying on the avatar
 * alone - quieter than the name they label, monospace so they never read as part of it.
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
  const communityIsPrimary = showGroup && !!post.groupId;

  const meta = (
    <>
      <span aria-hidden className="text-neutral-700">
        ·
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-500">{timeAgo(post.createdAt)}</span>
      {roleLabel && <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-neutral-600">{roleLabel}</span>}
      {pending && <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-amber-400">Pending approval</span>}
    </>
  );

  if (communityIsPrimary) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href={groupHref(post.groupId as string)} className="shrink-0">
          <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Community"} seed={post.groupId ?? undefined} size={26} />
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <Link href={groupHref(post.groupId as string)} className="min-w-0 truncate text-[13px] font-semibold text-white transition hover:text-neutral-300">
            <span aria-hidden className="mr-1 font-mono text-[10.5px] font-normal text-neutral-500">
              C/
            </span>
            {post.groupName}
          </Link>
          {meta}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <EntityAvatar imageUrl={authorAvatarUrl} name={post.authorName} seed={post.userId} size={26} />
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="min-w-0 truncate text-[13px] font-semibold text-white">
          <span aria-hidden className="mr-1 font-mono text-[10.5px] font-normal text-neutral-500">
            U/
          </span>
          {post.authorName}
        </span>
        {meta}
      </div>
    </div>
  );
}
