"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { PostCardData } from "./types";
import type { SessionPhase } from "@/lib/communityWeekend";
import { CallRecordBadge } from "./CallChip";
import { AuthorProfilePopover } from "./AuthorProfilePopover";
import { PredictorFlairsList } from "./PredictorFlair";

/**
 * Who wrote a post, the way a social feed says it: the author's own photo, and one muted line
 * (critique §5.1): `Sam Rivera · Tifosi United · 3h`. In the feed across communities the community's
 * avatar sits as a small badge on the author's photo, so where a post lives reads at a glance without a
 * second avatar column. A role badge only when the author holds one; Pending only for the author and
 * moderators.
 */
type HeaderProps = {
  post: PostCardData;
  showGroup: boolean;
  /** Admin/Moderator, when the author holds one. */
  roleLabel?: string;
  pending?: boolean;
  /** Where in the race weekend the post was written (Communities' weekend mode), shown after the time. */
  sessionTag?: SessionPhase;
};

/** "during Qualifying" (with a live dot), "after FP2", "build-up". */
function SessionTag({ tag }: { tag: NonNullable<SessionPhase> }) {
  if (tag.phase === "build-up") return <span className="shrink-0 whitespace-nowrap text-tertiary">build-up</span>;
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-tertiary" title={tag.phase === "live" ? `Written while ${tag.label} was running` : `Written after ${tag.label}`}>
      {tag.phase === "live" && <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
      {tag.phase === "live" ? "during" : "after"} {tag.label}
    </span>
  );
}

export function PostAvatar({ post, showGroup, size = 40 }: Pick<HeaderProps, "post" | "showGroup"> & { size?: number }) {
  const { user, avatar: myAvatar } = useAuth();
  const isMe = !!user && user.uid === post.userId;
  const resolvedAvatar = post.authorAvatar ?? (isMe ? myAvatar : null);
  const photo = (
    <AuthorProfilePopover
      userId={post.userId}
      authorName={post.authorName}
      authorAvatar={resolvedAvatar}
      authorRole={post.authorRole}
      authorRecord={post.authorRecord}
      groupId={post.groupId}
      groupName={post.groupName}
    >
      {({ ref, toggle, open }) => (
        <button
          ref={ref as (node: HTMLButtonElement | null) => void}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-expanded={open}
          aria-label={`About ${post.authorName}`}
          className="flex min-h-6 min-w-6 shrink-0 rounded-full transition-opacity duration-fast hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <PersonAvatar id={post.userId} avatar={resolvedAvatar} size={size} />
        </button>
      )}
    </AuthorProfilePopover>
  );
  if (!(showGroup && post.groupId)) return photo;
  const badge = Math.round(size * 0.45);
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {photo}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 -right-1 rounded-full ring-2 ring-surface-0"
      >
        <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Community"} seed={post.groupId} size={badge} />
      </span>
    </span>
  );
}

export function PostByline({ post, showGroup, roleLabel, pending, sessionTag }: HeaderProps) {
  const { user, avatar: myAvatar } = useAuth();
  const isMe = !!user && user.uid === post.userId;
  const resolvedAvatar = post.authorAvatar ?? (isMe ? myAvatar : null);
  const inCommunity = showGroup && !!post.groupId;
  const dot = (
    <span aria-hidden className="text-tertiary">
      ·
    </span>
  );
  return (
    <div className="flex min-w-0 items-center gap-x-1.5 text-body-sm leading-5">
      <AuthorProfilePopover
        userId={post.userId}
        authorName={post.authorName}
        authorAvatar={resolvedAvatar}
        authorRole={post.authorRole}
        authorRecord={post.authorRecord}
        groupId={post.groupId}
        groupName={post.groupName}
      >
        {({ ref, toggle, open }) => (
          <button
            ref={ref as (node: HTMLButtonElement | null) => void}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            aria-expanded={open}
            className="min-w-0 shrink truncate rounded-control font-semibold text-primary transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {post.authorName}
          </button>
        )}
      </AuthorProfilePopover>
      {post.authorRecord && <CallRecordBadge record={post.authorRecord} />}
      {post.authorFlairs && <PredictorFlairsList flairs={post.authorFlairs} />}
      {roleLabel && <Badge tone="neutral">{roleLabel}</Badge>}
      {inCommunity && (
        <>
          {dot}
          <Link href={groupHref(post.groupId as string)} className="min-w-0 shrink-[2] truncate text-secondary underline-offset-2 hover:text-primary hover:underline">
            {post.groupName}
          </Link>
        </>
      )}
      {dot}
      <time suppressHydrationWarning dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()} className="shrink-0 whitespace-nowrap text-tertiary">
        {timeAgo(post.createdAt)}
      </time>
      {post.editedAt && (
        <span title={`Edited ${new Date(post.editedAt).toLocaleString()}`} className="shrink-0 text-tertiary">
          (edited)
        </span>
      )}
      {sessionTag && (
        <>
          <span aria-hidden className="hidden text-tertiary sm:inline">
            ·
          </span>
          <span className="hidden sm:flex">
            <SessionTag tag={sessionTag} />
          </span>
        </>
      )}
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
