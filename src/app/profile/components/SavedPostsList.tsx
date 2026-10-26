"use client";

import { useState } from "react";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import { PostCard } from "@/app/communities/components/post/PostCard";

export function SavedPostsList({ initialPosts }: { initialPosts: GroupPost[] }) {
  const [posts, setPosts] = useState(initialPosts);

  return posts.length > 0 ? (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} showGroup={false} onSavedChange={(saved) => !saved && setPosts((current) => current.filter((item) => item.id !== post.id))} />
      ))}
    </div>
  ) : (
    <div className="rounded-card border border-white/[0.08] bg-white/[0.02] px-4 py-8 text-center">
      <p className="text-body-sm font-medium text-primary">No saved posts yet</p>
      <p className="mt-1 text-caption text-secondary">Save a post from any feed to find it here.</p>
    </div>
  );
}
