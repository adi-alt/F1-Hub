"use client";

import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { PostCardData } from "./types";

/**
 * A post has exactly ONE primary visual identity, not two avatars stacked on top of each other:
 *
 *  - inside a community (`showGroup` true and `post.groupId` set - the Groups home feed showing a
 *    post that belongs to a real community): the COMMUNITY is what anchors it - [community pfp]
 *    C/{community name}. Who specifically wrote it is real information a reader still needs (to
 *    reply meaningfully, to recognise a regular, for moderation), so it's kept, but as a quiet
 *    secondary line with no avatar of its own - not a second same-weight identity competing with
 *    the community's.
 *  - everywhere else (a personal post with no community, or a community's own Feed tab where the
 *    page itself already establishes which community this is) - the AUTHOR is the primary identity:
 *    [author pfp] U/{author name}, with time/role/pending as the quiet secondary line under it.
 *
 * `C/` and `U/` prefixes say which kind of identity is showing without relying on position or
 * color alone (real for anyone who can't rely on either - screen magnification, a fast skim, color
 * vision deficiency) - rendered quieter than the name they label (their own dimmer, monospace
 * tone), the same idea as F1 timing screens' own single-letter status prefixes.
 *
 * Author avatar: `profiles` has no avatar_url column anywhere in this app (traced - the only
 * per-user photo this product has is `session.photoURL`, an OAuth provider's avatar_url captured
 * into the session at sign-in, see createSession.ts; it's never written back to a table a post-
 * authors query could join against). So there is a real photo for exactly one author on any given
 * screen - the viewer's own posts - and this is that one honest case: when `post.userId` matches
 * the signed-in user's own id, their own real `session.photoURL` (the exact same value ProfileMenu's
 * header avatar and the composer already render) is used instead of a blank initial. Every other
 * author correctly still falls through to EntityAvatar's deterministic initials fallback, because
 * no real photo for them exists anywhere in this data model - not a guess, not a community/author
 * mismatch, just the actual data that exists.
 */
export function PostHeader({
  post,
  showGroup,
  roleLabel,
  pending,
}: {
  post: PostCardData;
  showGroup: boolean;
  /** ADMIN/MODERATOR, when the author holds one - rendered on the quiet secondary line, never
   * stacked as a separate same-weight badge next to the primary identity. */
  roleLabel?: string;
  pending?: boolean;
}) {
  const { user } = useAuth();
  const isMe = !!user && user.uid === post.userId;
  const authorAvatarUrl = isMe ? (user.photoURL ?? null) : null;
  const communityIsPrimary = showGroup && !!post.groupId;

  const secondary = (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-neutral-500">
      {communityIsPrimary && (
        <>
          <span className="font-medium text-neutral-400">
            <span aria-hidden className="mr-0.5 font-mono text-neutral-600">
              U/
            </span>
            {post.authorName}
          </span>
          <span aria-hidden>·</span>
        </>
      )}
      {roleLabel && (
        <>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{roleLabel}</span>
          <span aria-hidden>·</span>
        </>
      )}
      <span>{timeAgo(post.createdAt)}</span>
      {pending && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">· Pending approval</span>}
    </p>
  );

  if (communityIsPrimary) {
    return (
      <div className="min-w-0">
        <Link href={groupHref(post.groupId as string)} className="group flex min-w-0 items-center gap-2 hover:opacity-90">
          <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Community"} seed={post.groupId ?? undefined} size={26} />
          <span className="min-w-0 truncate text-sm font-semibold text-white">
            <span aria-hidden className="mr-0.5 font-mono text-[11px] font-normal text-neutral-600">
              C/
            </span>
            {post.groupName}
          </span>
        </Link>
        {secondary}
      </div>
    );
  }

  // No community (a personal post) or the community's own Feed tab (showGroup=false, since the
  // page itself already establishes which community this is) - the author is the one identity to
  // show, at the same primary weight the community gets above.
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <EntityAvatar imageUrl={authorAvatarUrl} name={post.authorName} seed={post.userId} size={26} />
        <span className="min-w-0 truncate text-sm font-semibold text-white">
          <span aria-hidden className="mr-0.5 font-mono text-[11px] font-normal text-neutral-600">
            U/
          </span>
          {post.authorName}
        </span>
      </div>
      {secondary}
    </div>
  );
}
