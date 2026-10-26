"use client";

import { useRef, useState } from "react";
import type { VoteValue } from "@/lib/supabase/groupPosts";

/** Reddit-style vote state machine, shared by post votes and comment votes (only the URL differs) -
 * clicking the already-active direction clears it, clicking the other direction switches straight
 * over, both structurally impossible to leave in a "both up and down" state since myVote is a
 * single value, not two booleans. Optimistic: the UI updates immediately, reverts only if the
 * request actually fails. Lives in the card itself (not lifted to a parent list's state) - each
 * card stays mounted for as long as it's in the feed, so there's nothing a parent needs this for.
 *
 * `requestId` guards against a real race: click up, then quickly click down again before the first
 * request resolves. Two in-flight requests now exist, and network responses aren't guaranteed to
 * arrive in the order they were sent. Without this guard, an OLDER request's failure handler would
 * call `setState(prev)` with ITS OWN pre-click snapshot - silently reverting the newer, already-
 * applied vote back to a stale state, even though the second click actually succeeded. Only the
 * most recent call's own response is allowed to touch state; a stale one is simply ignored, since
 * whichever request actually corresponds to the current vote will resolve on its own. */
export function useOptimisticVote(voteUrl: string, initialScore: number, initialMyVote: VoteValue) {
  const [state, setState] = useState({ score: initialScore, myVote: initialMyVote });
  // A second click can arrive before React has rendered the first optimistic update. Reading the
  // state captured by the function closure in that window applies both clicks to the same old
  // vote, which is why a quick up/down sequence used to look like the button had done nothing.
  const stateRef = useRef(state);
  const requestId = useRef(0);

  async function vote(direction: 1 | -1) {
    const id = ++requestId.current;
    const prev = stateRef.current;
    const nextVote: VoteValue = prev.myVote === direction ? 0 : direction;
    const next = { score: prev.score + (nextVote - prev.myVote), myVote: nextVote };
    stateRef.current = next;
    setState(next);
    const res = await fetch(voteUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction }) }).catch(() => null);
    if (id !== requestId.current) return; // a newer click already superseded this request
    if (!res?.ok) {
      stateRef.current = prev;
      setState(prev);
    }
  }

  return { score: state.score, myVote: state.myVote, vote };
}
