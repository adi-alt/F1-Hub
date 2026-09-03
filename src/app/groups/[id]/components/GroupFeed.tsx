"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { timeAgo } from "@/lib/format";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupRole } from "@/lib/supabase/groups";
import { CommentThread } from "../../components/CommentThread";

const ROLE_LABEL: Record<GroupRole, string> = { admin: "ADMIN", moderator: "MODERATOR", member: "MEMBER" };

function PostRow({
  groupId,
  post,
  canModerate,
  onModerated,
  onVoted,
  onCommentAdded,
}: {
  groupId: string;
  post: GroupPost;
  canModerate: boolean;
  onModerated: () => void;
  onVoted: (id: string, voted: boolean) => void;
  onCommentAdded: (id: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [voting, setVoting] = useState(false);

  async function vote() {
    if (voting) return;
    setVoting(true);
    onVoted(post.id, !post.hasVoted);
    const res = await fetch(`/api/groups/${groupId}/posts/${post.id}/vote`, { method: "POST" });
    if (!res.ok) onVoted(post.id, post.hasVoted); // revert on failure
    setVoting(false);
  }

  async function moderate(action: "approve" | "reject") {
    await fetch(`/api/groups/${groupId}/posts/${post.id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    onModerated();
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-white">{post.authorName}</span>
        {post.authorRole !== "member" && <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{ROLE_LABEL[post.authorRole]}</span>}
        <span className="text-neutral-600">· {timeAgo(post.createdAt)}</span>
        {post.status === "pending" && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Pending approval</span>}
      </div>
      <p className="mt-2 text-sm text-neutral-200">{post.content}</p>

      <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
        <button onClick={() => void vote()} className={`flex items-center gap-1 transition hover:text-white ${post.hasVoted ? "text-[var(--f1-red)]" : ""}`}>
          ↑ {post.upvotes}
        </button>
        <button onClick={() => setShowComments((v) => !v)} className="flex items-center gap-1 transition hover:text-white">
          💬 {post.commentCount}
        </button>
        {canModerate && post.status === "pending" && (
          <>
            <button onClick={() => void moderate("approve")} className="text-emerald-400 hover:text-emerald-300">
              Approve
            </button>
            <button onClick={() => void moderate("reject")} className="text-[var(--f1-red)] hover:brightness-125">
              Remove
            </button>
          </>
        )}
        {canModerate && post.status === "published" && (
          <button onClick={() => void moderate("reject")} className="ml-auto text-neutral-600 hover:text-[var(--f1-red)]">
            Remove
          </button>
        )}
      </div>

      {showComments && <CommentThread groupId={groupId} postId={post.id} onAdded={() => onCommentAdded(post.id)} />}
    </motion.div>
  );
}

export function GroupFeed({ groupId, initialPosts, myRole, moderationEnabled }: { groupId: string; initialPosts: GroupPost[]; myRole: GroupRole; moderationEnabled: boolean }) {
  const [posts, setPosts] = useState(initialPosts);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState("");
  const canModerate = myRole === "admin" || myRole === "moderator";

  async function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPosting(true);
    const res = await fetch(`/api/groups/${groupId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed }),
    });
    const body = (await res.json().catch(() => null)) as { status?: "published" | "pending"; error?: string } | null;
    if (res.ok) {
      setDraft("");
      setNotice(body?.status === "pending" ? "Your post is awaiting moderator approval." : "");
      const refreshed = await fetch(`/api/groups/${groupId}/posts`).then((r) => r.json());
      setPosts(refreshed.posts);
    }
    setPosting(false);
  }

  return (
    <div>
      <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={moderationEnabled && myRole === "member" ? "Share something with the group (posts need approval)..." : "Share something with the group..."}
          rows={2}
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <AnimatePresence>
            {notice && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-neutral-500">
                {notice}
              </motion.p>
            )}
          </AnimatePresence>
          <button
            onClick={() => void submit()}
            disabled={posting || !draft.trim()}
            className="ml-auto rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <AnimatePresence initial={false}>
          {posts.map((post) => (
            <PostRow
              key={post.id}
              groupId={groupId}
              post={post}
              canModerate={canModerate}
              onVoted={(id, voted) => setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, hasVoted: voted, upvotes: p.upvotes + (voted ? 1 : -1) } : p)))}
              onModerated={() => void fetch(`/api/groups/${groupId}/posts`).then((r) => r.json()).then((body: { posts: GroupPost[] }) => setPosts(body.posts))}
              onCommentAdded={(id) => setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, commentCount: p.commentCount + 1 } : p)))}
            />
          ))}
        </AnimatePresence>
        {posts.length === 0 && <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-6 text-center text-sm text-neutral-500">No posts yet - start the conversation.</p>}
      </div>
    </div>
  );
}
