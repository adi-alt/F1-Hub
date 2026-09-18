"use client";

import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { PostCardData } from "./types";

/**
 * Two identities, ranked - not one or the other.
 *
 * A community post has both a WHERE (the community it was posted into) and a WHO (the person who
 * wrote it), and collapsing them to whichever one "anchors" the post loses real information: the
 * cross-community feed showed only the community, so you could not tell who had written anything
 * without opening it. Both now render, with the community as the quieter line above the author.
 *
 *  - a post in a community: [community pfp] C/{name}, then [author pfp] U/{name} · time
 *  - a personal post, or any post inside a community's own Feed tab (where the page itself already
 *    says which community this is): [author pfp] U/{name} · time, with no community line invented
 *    above it
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
      <span className="shrink-0 whitespace-nowrap text-xs text-neutral-500">{timeAgo(post.createdAt)}</span>
      {roleLabel && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{roleLabel}</span>}
      {pending && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-400">Pending approval</span>}
    </>
  );

  const author = (
    <div className="flex min-w-0 items-center gap-2.5">
      <EntityAvatar imageUrl={authorAvatarUrl} name={post.authorName} seed={post.userId} size={36} />
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="min-w-0 truncate text-sm font-semibold text-white">
          <span aria-hidden className="mr-1 font-mono text-xs font-normal text-neutral-500">
            U/
          </span>
          {post.authorName}
        </span>
        {meta}
      </div>
    </div>
  );

  // A post in a community has two genuinely different identities and shows both: WHERE it lives
  // (the community) above WHO wrote it (the author). The community line is deliberately the
  // quieter of the two - smaller avatar, muted type - because the author is the one speaking; it's
  // context, not a co-equal heading. A personal post has no community to name, so it gets the
  // author line alone and nothing is invented to sit above it.
  if (!communityIsPrimary) return <div className="min-w-0 flex-1">{author}</div>;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Link href={groupHref(post.groupId as string)} className="flex min-w-0 max-w-full items-center gap-1.5 self-start transition hover:text-neutral-200">
        <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Community"} seed={post.groupId ?? undefined} size={18} shape="square" />
        <span className="min-w-0 truncate text-xs font-medium text-neutral-400">
          <span aria-hidden className="mr-1 font-mono text-[11px] font-normal text-neutral-600">
            C/
          </span>
          {post.groupName}
        </span>
      </Link>
      {author}
    </div>
  );
}
