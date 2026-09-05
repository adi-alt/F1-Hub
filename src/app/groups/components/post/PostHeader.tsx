import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { PostCardData } from "./types";

/** The group name/avatar (when shown) is the only navigation target in the header - clicking it
 * opens the group's real homepage. No "View in group ->" anywhere else on the card (removed
 * entirely, per the request's own explicit call-out) - the header already is that link. Author
 * name isn't a link: there's no per-user profile page in this app to send it to, and a dead link
 * is worse than plain text. */
export function PostHeader({ post, showGroup }: { post: PostCardData; showGroup: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      {showGroup &&
        (post.groupId ? (
          <Link href={groupHref(post.groupId)} className="flex items-center gap-1.5 font-semibold text-neutral-200 hover:text-white">
            <EntityAvatar imageUrl={post.groupAvatarUrl ?? null} name={post.groupName ?? "Group"} size={18} />
            {post.groupName}
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 font-semibold text-neutral-400">
            <EntityAvatar imageUrl={null} name={post.authorName} size={18} />
            Personal post
          </span>
        ))}
      {showGroup && <span className="text-neutral-600">·</span>}
      <span className="text-neutral-400">{post.authorName}</span>
      <span className="text-neutral-600">·</span>
      <span className="text-neutral-600">{timeAgo(post.createdAt)}</span>
    </div>
  );
}
