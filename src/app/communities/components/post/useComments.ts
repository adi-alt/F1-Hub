"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommentReactionEmoji, CommentReactionSummary, PostComment } from "@/lib/supabase/groupPosts";

export type CommentSort = "top" | "newest" | "oldest";
export type CommentFilter = "all" | "op" | "media";

/** A comment that exists on screen but not yet on the server. */
export type LocalComment = PostComment & { pending?: boolean; failed?: boolean };

/** Sorting applies to siblings at every level, not just the root - a reply thread ordered by "Top"
 * that leaves its own children in insertion order is a half-applied sort. Exported for its own
 * test, since "newest" and "top" disagreeing on ties is exactly the sort of thing that silently
 * reorders a list on every render. */
export function sortComments<T extends { score: number; createdAt: string }>(comments: T[], sort: CommentSort): T[] {
  const out = [...comments];
  if (sort === "newest") return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (sort === "oldest") return out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  // Ties broken by age (older first), so an all-zero-score thread reads chronologically rather
  // than shuffling whenever React re-renders.
  return out.sort((a, b) => b.score - a.score || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Groups a flat comment list into parent -> children. The API returns flat rows with
 * `parentCommentId`; the tree is built here because a handful of comments per post is trivial to
 * nest in JS and doing it server-side would mean a recursive CTE for no gain. */
export function buildTree(comments: LocalComment[], sort: CommentSort): { roots: LocalComment[]; childrenOf: Map<string, LocalComment[]> } {
  const childrenOf = new Map<string, LocalComment[]>();
  const roots: LocalComment[] = [];
  const authorById = new Map<string, string>();
  for (const comment of comments) {
    if (!comment.deleted && comment.authorName) authorById.set(comment.id, comment.authorName);
  }
  // Deleted comments are omitted from the conversation. Replies whose parent was deleted remain
  // visible and are promoted to the nearest visible level by the orphan handling below.
  const visibleComments = comments
    .filter((comment) => !comment.deleted)
    .map((comment) => {
      if (comment.parentCommentId && comment.parentAuthorName === undefined && authorById.has(comment.parentCommentId)) {
        return { ...comment, parentAuthorName: authorById.get(comment.parentCommentId) ?? null };
      }
      return comment;
    });

  for (const comment of visibleComments) {
    if (comment.parentCommentId === null) {
      roots.push(comment);
      continue;
    }
    const siblings = childrenOf.get(comment.parentCommentId);
    if (siblings) siblings.push(comment);
    else childrenOf.set(comment.parentCommentId, [comment]);
  }

  // An orphan (its parent was deleted while this page was open) would otherwise vanish silently -
  // it's promoted to a root so the text someone wrote is still readable.
  for (const comment of visibleComments) {
    if (comment.parentCommentId !== null && !visibleComments.some((c) => c.id === comment.parentCommentId)) {
      roots.push(comment);
    }
  }

  const sortedChildren = new Map<string, LocalComment[]>();
  for (const [parentId, list] of childrenOf) sortedChildren.set(parentId, sortComments(list, sort));
  const sortedRoots = sortComments(roots, sort).sort(
    (a, b) => Number(Boolean(b.accepted)) - Number(Boolean(a.accepted)) || Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
  );
  return { roots: sortedRoots, childrenOf: sortedChildren };
}

/** Filters a comment tree by search query and/or quick filter (`all` | `op` | `media`) while preserving ancestor chains. */
export function filterCommentTree(
  tree: { roots: LocalComment[]; childrenOf: Map<string, LocalComment[]> },
  query: string,
  filter: CommentFilter = "all",
): { roots: LocalComment[]; childrenOf: Map<string, LocalComment[]> } {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed && filter === "all") return tree;

  const matches = (comment: LocalComment): boolean => {
    if (filter === "op" && !comment.isOp) return false;
    if (filter === "media" && !comment.mediaUrl) return false;
    if (!trimmed) return true;
    return comment.content.toLowerCase().includes(trimmed) || comment.authorName.toLowerCase().includes(trimmed);
  };

  const filteredChildren = new Map<string, LocalComment[]>();
  const keepNode = (node: LocalComment): boolean => {
    const kids = tree.childrenOf.get(node.id) ?? [];
    const keptKids = kids.filter(keepNode);
    if (keptKids.length > 0) filteredChildren.set(node.id, keptKids);
    return matches(node) || keptKids.length > 0;
  };

  const filteredRoots = tree.roots.filter(keepNode);
  return { roots: filteredRoots, childrenOf: filteredChildren };
}

/** Total descendants under a comment - what "View all N replies" counts. */
export function countDescendants(id: string, childrenOf: Map<string, LocalComment[]>): number {
  const children = childrenOf.get(id) ?? [];
  return children.reduce((total, child) => total + 1 + countDescendants(child.id, childrenOf), 0);
}

/**
 * All the comment state for one post, shared by the inline thread and the side drawer so the two
 * can't drift apart or double-fetch.
 *
 * Adding a comment is optimistic: it appears instantly, reconciles to the server's real row on
 * success, and on failure stays visible and marked rather than vanishing with the user's text.
 */
export function useComments(postId: string, onCountChange?: (count: number) => void) {
  const [comments, setComments] = useState<LocalComment[] | null>(null);
  const [sort, setSort] = useState<CommentSort>("top");
  const [error, setError] = useState(false);
  // `add` below is a useCallback keyed only on `postId` (deliberately - see its own comment), so
  // its closure over `comments` is captured once and never updates for the life of this postId,
  // even though `comments` state itself does. Confirmed live: every `add()` call was reporting
  // count 1 to onCountChange regardless of how many comments actually existed, since the closure's
  // `comments` was permanently the initial `null`. A ref sidesteps that - always read at call time,
  // never captured.
  const commentsRef = useRef<LocalComment[] | null>(null);
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  // No synchronous setState anywhere in here: every write happens in a promise callback. The old
  // `setError(false)` reset at the top meant calling load() from an effect body WAS a synchronous
  // state update, which cascades an extra render on every mount. Clearing the error on success
  // instead is equivalent and keeps this callable from anywhere.
  const load = useCallback(() => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    return fetch(`/api/posts/${postId}/comments`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<{ comments: PostComment[] }>;
      })
      .then((body) => {
        // A person can submit from the footer while the initial thread is still loading. Keep
        // those local rows until the server response contains their real ids; otherwise the GET
        // response silently erases the text they just submitted.
        if (requestId !== loadRequestId.current) return;
        const local = (commentsRef.current ?? []).filter((comment) => comment.id.startsWith("temp-") && (comment.pending || comment.failed));
        const serverIds = new Set(body.comments.map((comment) => comment.id));
        const merged = [...body.comments, ...local.filter((comment) => !serverIds.has(comment.id))];
        commentsRef.current = merged;
        setComments(merged);
        setError(false);
        onCountChangeRef.current?.(merged.length);
      })
      .catch(() => setError(true));
  }, [postId]);

  const loadRequestId = useRef(0);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (content: string, parentCommentId: string | null, mediaUrl?: string | null): Promise<boolean> => {
      const tempId = `temp-${Date.now()}`;
      const optimistic: LocalComment = {
        id: tempId,
        postId,
        userId: "",
        authorName: "You",
        authorAvatar: null,
        content,
        mediaUrl: mediaUrl ?? null,
        parentCommentId,
        createdAt: new Date().toISOString(),
        score: 0,
        myVote: 0,
        mine: true,
        canDelete: true,
        pending: true,
      };
      const nextComments = [...(commentsRef.current ?? []), optimistic];
      commentsRef.current = nextComments;
      setComments(nextComments);
      onCountChangeRef.current?.(nextComments.length);

      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentCommentId, mediaUrl: mediaUrl ?? null }),
      }).catch(() => null);

      if (!res?.ok) {
        setComments((prev) => {
          const next = (prev ?? []).map((c) => (c.id === tempId ? { ...c, pending: false, failed: true } : c));
          commentsRef.current = next;
          return next;
        });
        return false;
      }

      const body = (await res.json().catch(() => null)) as { id?: string } | null;
      setComments((prev) => {
        const next = (prev ?? []).map((c) => (c.id === tempId ? { ...c, id: body?.id ?? c.id, pending: false } : c));
        commentsRef.current = next;
        return next;
      });
      return true;
    },
    [postId],
  );

  const togglePin = useCallback(
    async (commentId: string, pinned: boolean) => {
      const snapshot = commentsRef.current;
      setComments((prev) => {
        const next = (prev ?? []).map((c) => {
          if (c.id === commentId) return { ...c, pinned };
          if (pinned && c.pinned) return { ...c, pinned: false };
          return c;
        });
        commentsRef.current = next;
        return next;
      });
      const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      }).catch(() => null);
      if (!res?.ok) {
        commentsRef.current = snapshot;
        setComments(snapshot);
      }
    },
    [postId],
  );

  const toggleAccept = useCallback(
    async (commentId: string, accepted: boolean) => {
      const snapshot = commentsRef.current;
      setComments((prev) => {
        const next = (prev ?? []).map((c) => {
          if (c.id === commentId) return { ...c, accepted };
          if (accepted && c.accepted) return { ...c, accepted: false };
          return c;
        });
        commentsRef.current = next;
        return next;
      });
      const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted }),
      }).catch(() => null);
      if (!res?.ok) {
        commentsRef.current = snapshot;
        setComments(snapshot);
      }
    },
    [postId],
  );

  const toggleReaction = useCallback(
    async (commentId: string, emoji: CommentReactionEmoji) => {
      const snapshot = commentsRef.current;
      setComments((prev) => {
        const next = (prev ?? []).map((c) => {
          if (c.id !== commentId) return c;
          const current = c.reactions ?? [];
          const existing = current.find((r) => r.emoji === emoji);
          let nextReactions: CommentReactionSummary[];
          if (existing) {
            if (existing.mine) {
              nextReactions =
                existing.count <= 1
                  ? current.filter((r) => r.emoji !== emoji)
                  : current.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r));
            } else {
              nextReactions = current.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r));
            }
          } else {
            nextReactions = [...current, { emoji, count: 1, mine: true }];
          }
          return { ...c, reactions: nextReactions };
        });
        commentsRef.current = next;
        return next;
      });

      const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction: emoji }),
      }).catch(() => null);
      if (!res?.ok) {
        commentsRef.current = snapshot;
        setComments(snapshot);
        return;
      }
      const body = (await res.json().catch(() => null)) as { reactions?: CommentReactionSummary[] } | null;
      if (body?.reactions) {
        setComments((prev) => {
          const next = (prev ?? []).map((c) => (c.id === commentId ? { ...c, reactions: body.reactions } : c));
          commentsRef.current = next;
          return next;
        });
      }
    },
    [postId],
  );

  const discard = useCallback((id: string) => {
    const next = (commentsRef.current ?? []).filter((comment) => comment.id !== id);
    commentsRef.current = next;
    setComments(next);
    onCountChangeRef.current?.(next.length);
  }, []);

  const tree = useMemo(() => buildTree(comments ?? [], sort), [comments, sort]);

  return {
    comments,
    tree,
    sort,
    setSort,
    add,
    togglePin,
    toggleAccept,
    toggleReaction,
    discard,
    reload: load,
    error,
    loading: comments === null,
  };
}
