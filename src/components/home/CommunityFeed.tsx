import { PostCard } from "@/app/groups/components/post/PostCard";
import { PostCardSkeleton } from "@/app/groups/components/post/PostCardSkeleton";
import type { FeedPost } from "@/lib/supabase/groupPosts";

/** Real recent posts from groups the user belongs to, through the exact same PostCard the Groups
 * feed itself renders — a preview of that system, not a second post implementation. Group name is
 * already a clickable link inside PostHeader; the post itself opens its permalink via PostCard's
 * own comment-thread affordance. */
export function CommunityFeed({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) return null;

  return (
    <div className="space-y-3">
      {posts.map((post, i) => (
        <PostCard key={post.id} post={post} index={i} showGroup />
      ))}
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
