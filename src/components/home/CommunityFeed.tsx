import Link from "next/link";
import { PostCard } from "@/app/groups/components/post/PostCard";
import { PostCardSkeleton } from "@/app/groups/components/post/PostCardSkeleton";
import type { FeedPost } from "@/lib/supabase/groupPosts";

/** Real recent posts from groups the user belongs to (last ~7 days, filtered in PersonalHome),
 * through the exact same PostCard the Groups feed itself renders — a preview of that system, not a
 * second post implementation. Group name is already a clickable link inside PostHeader; the post
 * itself opens its permalink via PostCard's own comment-thread affordance. Its own widget shell
 * with a "View all" CTA, distinct from CommunitySnapshot/PredictionPolls next to it. */
export function CommunityFeed({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Latest community activity</p>
        <Link href="/groups" className="text-xs text-neutral-500 transition hover:text-white">
          View all →
        </Link>
      </div>
      <div className="mt-3 space-y-3">
        {posts.map((post, i) => (
          <PostCard key={post.id} post={post} index={i} showGroup />
        ))}
      </div>
    </div>
  );
}

export function CommunityFeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}
