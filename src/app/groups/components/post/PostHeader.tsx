"use client";

import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { PostCardData } from "./types";

/** The group name/avatar (when shown) is the only navigation target in the header - clicking it
 * opens the group's real homepage. No "View in group ->" anywhere else on the card (removed
 * entirely, per the request's own explicit call-out) - the header already is that link. Author
 * name isn't a link: there's no per-user profile page in this app to send it to, and a dead link
 * is worse than plain text.
 *
 * Author avatar: `profiles` has no avatar_url column at all anywhere in this app (traced - the
 * only per-user photo this product has is `session.photoURL`, an OAuth provider's avatar_url
 * captured into the session at sign-in, see createSession.ts; it's never written back to a table a
 * post-authors query could join against). So there is a real photo for exactly one author on any
 * given screen - the viewer's own posts - and this is that one honest case: when `post.userId`
 * matches the signed-in user's own id, their own real `session.photoURL` (the exact same value
 * ProfileMenu's header avatar and the composer already render) is used instead of a blank initial.
 * Every other author correctly still falls through to EntityAvatar's initials fallback, because no
 * real photo for them exists anywhere in this data model to show - not a guess, not a mismatch
 * between `community.avatar` and `author.avatar`, just the actual data that exists. */
export function PostHeader({ post, showGroup }: { post: PostCardData; showGroup: boolean }) {
  const { user } = useAuth();
  const isMe = !!user && user.uid === post.userId;
  const authorAvatarUrl = isMe ? (user.photoURL ?? null) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      {showGroup &&
        (post.groupId ? (
          <Link href={groupHref(post.groupId)} className="flex items-center gap-1.5 font-semibold text-neutral-200 hover:text-white">
            <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Community"} size={18} />
            {post.groupName}
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 font-semibold text-neutral-400">
            <EntityAvatar imageUrl={authorAvatarUrl} name={post.authorName} size={18} />
            Personal post
          </span>
        ))}
      {showGroup && <span className="text-neutral-600">·</span>}
      {/* The author avatar next to the plain name is only added in the `showGroup` (Groups home
       * feed) case - a community's own Feed tab renders this with showGroup=false and is
       * deliberately left exactly as it was; this pass is scoped to the Groups homepage only. */}
      <span className="flex items-center gap-1.5 text-neutral-400">
        {showGroup && post.groupId && <EntityAvatar imageUrl={authorAvatarUrl} name={post.authorName} size={18} />}
        {post.authorName}
      </span>
      <span className="text-neutral-600">·</span>
      <span className="text-neutral-600">{timeAgo(post.createdAt)}</span>
    </div>
  );
}
