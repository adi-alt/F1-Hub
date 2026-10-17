"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import type { VoteValue } from "@/lib/supabase/groupPosts";

/**
 * Up and down votes with the score between them, as quiet ghost buttons. Your vote fills its arrow (up in brand
 * red, down in blue, so the two are never confusable); hovering only lifts the tone. The score rolls up or down when it changes (it stays
 * put under reduced motion: MotionConfig). Purely presentational: onVote reports which arrow was clicked, the caller
 * (useOptimisticVote) owns the state.
 */
export function VoteControl({ score, myVote, onVote, compact = false }: { score: number; myVote: VoteValue; onVote: (direction: 1 | -1) => void; compact?: boolean }) {
  const arrow = (dir: 1 | -1) => {
    const on = myVote === dir;
    const Glyph = dir === 1 ? ArrowBigUp : ArrowBigDown;
    return (
      <button
        type="button"
        aria-label={dir === 1 ? "Upvote" : "Downvote"}
        aria-pressed={on}
        onClick={() => onVote(dir)}
        className={`relative flex size-9 items-center justify-center rounded-full transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
          on ? (dir === 1 ? "text-brand-text" : "text-info") : "text-tertiary hover:bg-surface-2 hover:text-primary"
        }`}
      >
        <Glyph aria-hidden size={18} strokeWidth={1.75} fill={on ? "currentColor" : "none"} />
      </button>
    );
  };
  const tone = myVote === 1 ? "text-brand-text" : myVote === -1 ? "text-info" : "text-secondary";
  return (
    <div className={compact ? "flex items-center" : "flex flex-col items-center gap-0.5"}>
      {arrow(1)}
      <span className={`relative inline-flex h-5 min-w-[1.5rem] items-center justify-center overflow-hidden text-body-sm font-semibold tabular ${tone}`}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={score} initial={{ y: myVote === -1 ? -10 : 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: myVote === -1 ? 10 : -10, opacity: 0 }} transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}>
            {score}
          </motion.span>
        </AnimatePresence>
      </span>
      {arrow(-1)}
    </div>
  );
}
