"use client";

import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { PostCardData } from "./types";

/**
 * A post carries two identities - the community it lives in, and the person who wrote it - and
 * they need to read as two different things, not one packed line. Community is the eyebrow: quiet,
 * small, identifies where this is. Author + time is the real byline underneath it: still quiet
 * relative to the post body, but the one line a reader actually looks at to know who said this.
 *
 * `showGroup` is only true on the Groups home feed (a cross-community stream, where "which
 * community" is real information); a community's own Feed tab passes false because the page itself
 * already establishes that. Either way the author byline renders the same way - one shared design,
 * not two different post headers living in the same component.
 *
 * Author avatar: `profiles` has no avatar_url column anywhere in this app (traced - the only
 * per-user photo this product has is `session.photoURL`, an OAuth provider's avatar_url captured
 * into the session at sign-in, see createSession.ts; it's never written back to a table a post-
 * authors query could join against). So there is a real photo for exactly one author on any given
 * screen - the viewer's own posts - and this is that one honest case: when `post.userId` matches
 * the signed-in user's own id, their own real `session.photoURL` (the exact same value ProfileMenu's
 * header avatar and the composer already render) is used instead of a blank initial. Every other
 * author correctly still falls through to EntityAvatar's initials fallback, because no real photo
 * for them exists anywhere in this data model - not a guess, not a community/author mismatch, just
 * the actual data that exists.
 */
export function PostHeader({
  post,
  showGroup,
  roleLabel,
  pending,
}: {
  post: PostCardData;
  showGroup: boolean;
  /** ADMIN/MODERATOR, when the author holds one - rendered on the quiet byline line, not stacked
   * as a separate same-weight badge next to the community eyebrow. */
  roleLabel?: string;
  pending?: boolean;
}) {
  const { user } = useAuth();
  const isMe = !!user && user.uid === post.userId;
  const authorAvatarUrl = isMe ? (user.photoURL ?? null) : null;

  return (
    <div className="min-w-0">
      {showGroup && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {post.groupId ? (
            <Link href={groupHref(post.groupId)} className="flex min-w-0 items-center gap-1.5 hover:text-neutral-300">
              <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Community"} size={16} />
              <span className="truncate normal-case tracking-normal text-neutral-400">{post.groupName}</span>
            </Link>
          ) : (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-1 w-1 rounded-full bg-neutral-600" />
              Personal post
            </span>
          )}
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-neutral-500 ${showGroup ? "mt-1" : ""}`}>
        <EntityAvatar imageUrl={authorAvatarUrl} name={post.authorName} size={18} />
        <span className="font-medium text-neutral-300">{post.authorName}</span>
        {roleLabel && <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{roleLabel}</span>}
        <span aria-hidden>·</span>
        <span>{timeAgo(post.createdAt)}</span>
        {pending && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">· Pending approval</span>}
      </div>
    </div>
  );
}
