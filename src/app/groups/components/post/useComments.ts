"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostComment } from "@/lib/supabase/groupPosts";

export type CommentSort = "top" | "newest";

/** A comment that exists on screen but not yet on the server. */
export type LocalComment = PostComment & { pending?: boolean; failed?: boolean };

/** Sorting applies to siblings at every level, not just the root - a reply thread ordered by "Top"
 * that leaves its own children in insertion order is a half-applied sort. Exported for its own
 * test, since "newest" and "top" disagreeing on ties is exactly the sort of thing that silently
 * reorders a list on every render. */
export function sortComments<T extends { score: number; createdAt: string }>(comments: T[], sort: CommentSort): T[] {
  const out = [...comments];
  if (sort === "newest") return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

  for (const comment of comments) {
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
  for (const comment of comments) {
    if (comment.parentCommentId !== null && !comments.some((c) => c.id === comment.parentCommentId)) {
      roots.push(comment);
    }
  }

  const sortedChildren = new Map<string, LocalComment[]>();
  for (const [parentId, list] of childrenOf) sortedChildren.set(parentId, sortComments(list, sort));
  return { roots: sortComments(roots, sort), childrenOf: sortedChildren };
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

  // No synchronous setState anywhere in here: every write happens in a promise callback. The old
  // `setError(false)` reset at the top meant calling load() from an effect body WAS a synchronous
  // state update, which cascades an extra render on every mount. Clearing the error on success
  // instead is equivalent and keeps this callable from anywhere.
  const load = useCallback(() => {
    return fetch(`/api/posts/${postId}/comments`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<{ comments: PostComment[] }>;
      })
      .then((body) => {
        setComments(body.comments);
        setError(false);
        onCountChange?.(body.comments.length);
      })
      .catch(() => setError(true));
    // onCountChange is a fresh closure each render from the caller's own setState; including it
    // would refetch on every render for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (content: string, parentCommentId: string | null): Promise<boolean> => {
      const tempId = `temp-${Date.now()}`;
      const optimistic: LocalComment = {
        id: tempId,
        postId,
        userId: "",
        authorName: "You",
        content,
        parentCommentId,
        createdAt: new Date().toISOString(),
        score: 0,
        myVote: 0,
        pending: true,
      };
      setComments((prev) => [...(prev ?? []), optimistic]);
      onCountChange?.((comments?.length ?? 0) + 1);

      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentCommentId }),
      }).catch(() => null);

      if (!res?.ok) {
        setComments((prev) => (prev ?? []).map((c) => (c.id === tempId ? { ...c, pending: false, failed: true } : c)));
        return false;
      }

      const body = (await res.json().catch(() => null)) as { id?: string } | null;
      setComments((prev) => (prev ?? []).map((c) => (c.id === tempId ? { ...c, id: body?.id ?? c.id, pending: false } : c)));
      return true;
    },
    // `comments` is only read for the count callback; adding it here would rebuild this on every
    // keystroke elsewhere in the tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [postId],
  );

  const discard = useCallback((id: string) => setComments((prev) => (prev ?? []).filter((c) => c.id !== id)), []);

  const tree = useMemo(() => buildTree(comments ?? [], sort), [comments, sort]);

  return { comments, tree, sort, setSort, add, discard, reload: load, error, loading: comments === null };
}
