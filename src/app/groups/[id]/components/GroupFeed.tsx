"use client";

import { useState } from "react";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupRole } from "@/lib/supabase/groups";
import { PostCard } from "../../components/post/PostCard";
import { PostComposer } from "../../components/PostComposer";

/** Uses the exact same PostCard/PostComposer the Groups home feed does (see PostCard's own
 * comment on why) - `fixedGroupId` locks the composer to this group, `showGroup={false}` on the
 * card since you're already on this group's own page. */
export function GroupFeed({ groupId, initialPosts, myRole, moderationEnabled }: { groupId: string; initialPosts: GroupPost[]; myRole: GroupRole; moderationEnabled: boolean }) {
  const [posts, setPosts] = useState(initialPosts);
  const canModerate = myRole === "admin" || myRole === "moderator";

  function refresh() {
    fetch(`/api/groups/${groupId}/posts`)
      .then((r) => r.json())
      .then((body: { posts: GroupPost[] }) => setPosts(body.posts))
      .catch(() => {});
  }

  return (
    <div>
      <PostComposer
        groups={[]}
        fixedGroupId={groupId}
        placeholder={moderationEnabled && myRole === "member" ? "Share something with the group (posts need approval)..." : "Share something with the group..."}
        onPosted={refresh}
      />

      <div className="mt-4 space-y-3">
        {posts.map((post, i) => (
          <PostCard key={post.id} post={post} index={i} showGroup={false} canModerate={canModerate} onModerated={refresh} />
        ))}
        {posts.length === 0 && <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-6 text-center text-sm text-neutral-500">No posts yet - start the conversation.</p>}
      </div>
    </div>
  );
}
