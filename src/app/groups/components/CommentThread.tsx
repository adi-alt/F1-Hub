"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import type { PostComment } from "@/lib/supabase/groupPosts";

// Extracted out of GroupFeed.tsx (the group detail page's own feed tab) so the Groups home feed
// can render the exact same inline comment thread under each post instead of a second, near-
// identical implementation.
export function CommentThread({ groupId, postId, onAdded }: { groupId: string; postId: string; onAdded: () => void }) {
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/posts/${postId}/comments`)
      .then((res) => res.json())
      .then((body: { comments: PostComment[] }) => setComments(body.comments))
      .catch(() => setComments([]));
  }, [groupId, postId]);

  async function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPosting(true);
    const res = await fetch(`/api/groups/${groupId}/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed }),
    });
    if (res.ok) {
      setDraft("");
      const refreshed = await fetch(`/api/groups/${groupId}/posts/${postId}/comments`).then((r) => r.json());
      setComments(refreshed.comments);
      onAdded(); // bumps the post row's own commentCount - it isn't part of this thread's own state
    }
    setPosting(false);
  }

  return (
    <div className="mt-3 space-y-2.5 border-t border-[var(--f1-line)] pt-3">
      {comments === null ? (
        <div className="h-4 w-24 animate-pulse rounded bg-white/[0.06]" />
      ) : (
        comments.map((c) => (
          <div key={c.id} className="text-xs">
            <span className="font-semibold text-neutral-300">{c.authorName}</span> <span className="text-neutral-600">{timeAgo(c.createdAt)}</span>
            <p className="mt-0.5 text-neutral-400">{c.content}</p>
          </div>
        ))
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="Add a comment..."
          className="flex-1 rounded-lg border border-[var(--f1-line)] bg-black/30 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
        />
        <button onClick={() => void submit()} disabled={posting || !draft.trim()} className="shrink-0 text-xs font-semibold text-neutral-400 hover:text-white disabled:opacity-40">
          Post
        </button>
      </div>
    </div>
  );
}
