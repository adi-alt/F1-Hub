"use client";

import { useState } from "react";
import type { VoteValue } from "@/lib/supabase/groupPosts";

/** Reddit-style vote state machine, shared by post votes and comment votes (only the URL differs) -
 * clicking the already-active direction clears it, clicking the other direction switches straight
 * over, both structurally impossible to leave in a "both up and down" state since myVote is a
 * single value, not two booleans. Optimistic: the UI updates immediately, reverts only if the
 * request actually fails. Lives in the card itself (not lifted to a parent list's state) - each
 * card stays mounted for as long as it's in the feed, so there's nothing a parent needs this for. */
export function useOptimisticVote(voteUrl: string, initialScore: number, initialMyVote: VoteValue) {
  const [state, setState] = useState({ score: initialScore, myVote: initialMyVote });

  async function vote(direction: 1 | -1) {
    const prev = state;
    const nextVote: VoteValue = prev.myVote === direction ? 0 : direction;
    setState({ score: prev.score + (nextVote - prev.myVote), myVote: nextVote });
    const res = await fetch(voteUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction }) }).catch(() => null);
    if (!res?.ok) setState(prev);
  }

  return { score: state.score, myVote: state.myVote, vote };
}
